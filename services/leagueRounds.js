// Weekly leagues: each round is its own contest, settled when the round
// completes.
//
// The pool self-sizes from actual submissions - members who did not tip put
// nothing in and can win nothing. Missing a round is a free pass, not a
// penalty.
//
// Who wins is not decided here. pickWinners in services/results.js already
// applies the ranking rule (most correct tips, then closest margin, then a
// genuine tie), and this scopes it to a league's members. The only thing added
// is the arithmetic of the pool.

const db = require("../models");
const {
  pickWinners,
  marginDifference,
  RESCORE_RECENT_ROUNDS,
} = require("./results");
const { eligibleRounds, memberFrom, countsFor } = require("./leagueStandings");
const seasonService = require("./season");

// Winnings are stored in buy-in units, not dollars: one entrant's stake is 1.
//
// Two reasons. It keeps the division exact for as long as possible - a pool
// split three ways is a third, not 16.666666666666668 - and the buy-in is a
// property of the league, so storing points would bake today's buy-in into
// history that a later change could not correct. Multiply by league.buyIn to
// display.
//
// Never rounded up. Rounding a third to 0.34 three times invents points that
// nobody paid in, and over a season the supply drifts upward.
const poolShare = (entrants, winnerCount) =>
  winnerCount ? entrants / winnerCount : 0;

// A margin for sorting on. Predicting one is optional, and somebody who did
// not is not infinitely accurate - they simply have nothing to be separated by,
// so they sort behind everyone who did.
//
// Not `difference || Infinity`: a difference of 0 is an exact prediction, the
// best possible, and falsy. That mistake sent a round to the wrong tipster
// once already - see the note at the top of services/results.js.
const rankableDifference = (difference) =>
  difference === null || difference === undefined ? Infinity : difference;

// One round of one league. Returns what it did rather than writing silently,
// so a caller scoring a whole season can report it.
const TIP_FIELDS =
  "user correctTips marginTopEight topEightDifference bottomTenDifference";

const scoreRound = async (league, season, round, members) => {
  // Who entered, fixed the first time the round is paid.
  //
  // A result row is written for every entrant - winners and losers - so the
  // rows are the entrant list. This used to be worked out afresh on every
  // re-score from the league's *current* members, while a departed member's
  // row was left as it was paid. A winner leaving afterwards therefore meant
  // the rest were re-split a pot the leaver still held a share of: 5.667
  // entries paid out against 5 staked, during the review. A loser leaving
  // shrank the pot under the winners instead.
  //
  // Re-scoring still happens, and matters - it is how a result Squiggle
  // corrects after the siren moves the money - but only among the people who
  // were in the round. Deliberately unfiltered by membership: somebody who has
  // since left was an entrant, and stays one.
  const settled = await db.LeagueRoundResult.distinct("user", {
    league: league._id,
    season,
    round,
  });

  let tips;

  if (settled.length) {
    tips = await db.Tip.find({ season, round, user: { $in: settled } }).select(
      TIP_FIELDS
    );

    // An entrant whose tip has gone - rows from before account deletion stopped
    // removing tips. Their share cannot be recomputed and nobody else's should
    // be recomputed without them, which would be the original bug by another
    // door. The round stays exactly as it was paid.
    if (tips.length !== settled.length) {
      return {
        round,
        entrants: settled.length,
        winners: [],
        share: 0,
        unchanged: true,
      };
    }
  } else {
    const present =
      members || (await db.LeagueMembership.find({ league: league._id }));
    const ids = present.map((m) => m.user);

    // Who was in the league for this round. Someone who joined at round 15 has
    // tips from round 1 - they are real tips and they count on the global
    // ladder, but this league's pool is not theirs to enter or to win.
    const from = memberFrom(present, league, season);

    const all = await db.Tip.find({
      season,
      round,
      user: { $in: ids },
    }).select(TIP_FIELDS);

    tips = all.filter((tip) => countsFor(from, tip.user, round));

    // Nobody in this league tipped. No pool, and nothing to write - a round
    // with no entrants is not a round anyone lost.
    if (!tips.length) {
      return { round, entrants: 0, winners: [], share: 0 };
    }
  }

  const scored = tips.map((tip) => ({
    user: tip.user,
    correctTips: tip.correctTips || 0,
    countedDifference: marginDifference(tip),
  }));

  const winners = pickWinners(scored);
  const share = poolShare(tips.length, winners.length);

  // Compared as strings. Two ObjectId instances for the same id are never ===,
  // so includes() would match nobody and the round would pay out zero.
  const won = new Set(winners.map(String));

  // Upserted on (league, season, round, user), so re-scoring a round corrects
  // rather than duplicating.
  await db.LeagueRoundResult.bulkWrite(
    scored.map((s) => ({
      updateOne: {
        filter: { league: league._id, season, round, user: s.user },
        update: { $set: { winnings: won.has(String(s.user)) ? share : 0 } },
        upsert: true,
      },
    }))
  );

  return { round, entrants: tips.length, winners, share };
};

// Every round of a season this league should have scored. Only complete
// rounds: a round is settled when every game in it has been played, which is
// the same rule the global scoring uses.
//
// Bounded, for the reason calculateSeason is bounded: this runs hourly all
// year, and re-scoring March in September recomputes a settled round to the
// same answer it already has. Measured before the window: 66 queries and 212ms
// an hour, against 31 and 41ms for the global half - because this one grows
// with rounds times leagues rather than with rounds alone.
//
// This comment used to say the window also stopped a settled round being
// re-priced when somebody left. It narrowed that to the last four rounds and
// no further: inside the window, a departure still re-split a paid pot. What
// keeps a round decided among five entrants decided among five is now
// scoreRound, which takes its entrants from the rows written when the round
// was first paid. The window is back to being about cost.
const scoreSeason = async (
  league,
  season,
  { recentRounds = RESCORE_RECENT_ROUNDS } = {}
) => {
  const rounds = await eligibleRounds(league, season);
  const state = await seasonService.getSeasonState(season);
  const lastComplete =
    state.lastCompletedRound !== null && state.lastCompletedRound !== undefined
      ? state.lastCompletedRound
      : -1;

  // The memberships themselves rather than their ids: scoreRound needs
  // joinedAtRound to know whose round this was.
  const members = await db.LeagueMembership.find({ league: league._id });

  // Every round up to the last one finished - but only those that have
  // finished themselves.
  //
  // lastCompletedRound is the latest round whose games are all played, not a
  // promise about the rounds before it. A round with a postponed game sat
  // below a later finished one and was paid anyway, with that game's picks
  // scored as losses because they had never been scored at all. The global
  // pool never had this problem: results.calculateRound checks each round
  // itself. This now asks the same question.
  const candidates = rounds.filter((r) => r <= lastComplete);
  const games = candidates.length
    ? await db.Fixture.find({ year: season, round: { $in: candidates } }).select(
        "round complete"
      )
    : [];
  const finished = new Set(
    candidates.filter((r) => {
      const inRound = games.filter((g) => g.round === r);
      return inRound.length && inRound.every((g) => Number(g.complete) === 100);
    })
  );

  const due = candidates.filter((r) => finished.has(r));

  // Counted back from the last round this league actually settled, not from
  // the end of its calendar - in March the calendar runs to round 30, and
  // counting back from there steps over every round being played.
  const from = due.length ? Math.max(...due) - recentRounds : -Infinity;

  // Rounds this league has already written a result for. The window must not
  // hide one it has not: if the cron were down for a month, the rounds it
  // missed have to be picked up whenever it comes back, however old they are
  // by then - and those are precisely the rounds a window steps over.
  //
  // A round nobody in the league tipped writes no rows and so is retried every
  // hour. That is one Tip.find rather than the twenty-five this replaces, and
  // it is the safe direction to be wrong in: the alternative silently skips a
  // round that genuinely needed scoring.
  const scored = new Set(
    await db.LeagueRoundResult.distinct("round", { league: league._id, season })
  );

  const done = [];
  let skipped = 0;

  for (const round of due) {
    if (round < from && scored.has(round)) {
      skipped += 1;
      continue;
    }
    done.push(await scoreRound(league, season, round, members));
  }

  return {
    league: league.slug,
    season,
    rounds: done.length,
    entrants: done.reduce((n, r) => n + r.entrants, 0),
    skipped,
  };
};

// One round of one league, read rather than written.
//
// scoreRound above decides the money and stores it. This answers "what
// happened in this league that round" for a page: who entered, what they
// picked, who won, and where each of them finished.
//
// Built from memberships joined to tips, deliberately not from the stored
// LeagueRoundResult rows. Those are upserted and never deleted, so a league
// carries rows for people who have since left - 25 of them in one local league,
// three of which pay out. Reading them back would put a stranger in a league's
// table as the winner of a round they were never in.
//
// A league does not own every round. It owns the rounds from its own start
// onward, and a member owns the ones from when they joined - so this reports
// why a round is empty rather than returning an empty list and leaving the page
// to guess.
// Where everyone came in one round, by the round's own rule: most correct
// tips, then the closest margin.
//
// Ranked on that rather than on the money, so somebody who came second in a
// round nobody won still reads as second - and so a season league, which pays
// nothing at all, still has an order worth showing.
//
// Shared with the Overall Site Ladder's round, which is the same question over
// everybody rather than over a league's members. Two copies of a tie rule is
// how the two tables would come to disagree about who drew with whom.
//
// Takes [{ user, correctTips, countedDifference }] and returns a Map of user id
// to { rank, tied }.
const rankRound = (entered) => {
  const ranked = [...entered].sort(
    (a, b) =>
      b.correctTips - a.correctTips ||
      rankableDifference(a.countedDifference) -
        rankableDifference(b.countedDifference)
  );

  let place = 0;
  let previous = null;
  const places = new Map();
  const sharing = new Map();

  ranked.forEach((entry, index) => {
    const level =
      previous !== null &&
      previous.correctTips === entry.correctTips &&
      previous.countedDifference === entry.countedDifference;
    if (!level) place = index + 1;
    previous = entry;
    places.set(String(entry.user), { rank: place });
    sharing.set(place, (sharing.get(place) || 0) + 1);
  });

  // `tied` means this place is shared, not "level with whoever was above me in
  // the working order". The two are the same only while the table is displayed
  // in the order it was ranked, and these are not - equal places are then
  // sorted by name, so the marker landed on whichever of the pair the ranking
  // sort happened to put second. It read as "=4. dummyd" above "4. seeds", on
  // two rows with identical scores.
  for (const placing of places.values()) {
    placing.tied = sharing.get(placing.rank) > 1;
  }

  return places;
};

// showSelections is the round's lockout, decided by the caller from the season
// state and passed in rather than fetched here - roundEverywhere calls this
// once per league and would otherwise ask the same question five times.
//
// It defaults to true because every existing caller wants a round that has been
// played. The routes pass it explicitly.
const roundDetail = async (
  league,
  season,
  round,
  members,
  { showSelections = true } = {}
) => {
  const present =
    members ||
    (await db.LeagueMembership.find({ league: league._id }).populate({
      path: "user",
      select: "username",
    }));

  const eligible = await eligibleRounds(league, season);

  // The league did not exist yet, or the round is one it never runs - a finals
  // round, in a competition that only plays home-and-away.
  if (!eligible.includes(round)) {
    return {
      league: league.slug,
      name: league.name,
      type: league.type,
      round,
      status: "beforeLeague",
      startRound: league.startRound,
      // The same shape as a round that did happen, so the page reads one set
      // of fields rather than testing which kind of answer it received.
      pays: league.type === "weekly",
      buyIn: league.buyIn,
      entrants: 0,
      share: 0,
      winners: [],
      standings: [],
    };
  }

  const from = memberFrom(present, league, season);
  const withUser = present.filter((m) => m.user);

  // Everyone the round belonged to. Someone who joined later is not absent from
  // this round, they were not in it - which the page says differently.
  const theirs = withUser.filter((m) =>
    countsFor(from, (m.user && m.user._id) || m.user, round)
  );

  const ids = theirs.map((m) => (m.user && m.user._id) || m.user);

  // Only a weekly league has a pool each round. A season league is one contest
  // running all year, so its rounds have a best performance but no winner and
  // nothing to pay - saying otherwise would put a payout on a table where
  // nobody has staked anything.
  //
  // The ranking below is worked out either way: who did best in a round is
  // worth seeing whichever kind of league it is, which is the whole reason
  // these tables show opponents' tips.
  const pays = league.type === "weekly";

  // A round already paid is shown as it was paid, not worked out again.
  //
  // Its entrants were fixed when it was first paid (see scoreRound), and
  // somebody who has since left or deleted their account is still one of them.
  // Worked out afresh from today's members, the round table named different
  // winners and different shares from the ones paid - and from the season
  // table, which adds up what was paid. The site's round table reads its money
  // back for the same reason (globalLadder.roundDetail).
  //
  // The rows are still the league's current members and nobody else. The
  // people who have gone are counted - in the pot, and in the placings, so
  // "4th of 5" means what it says - and never named.
  const paidEntrants =
    pays && showSelections
      ? await db.LeagueRoundResult.distinct("user", {
          league: league._id,
          season,
          round,
        })
      : [];
  const paid = paidEntrants.length > 0;
  const entrantIds = new Set(paidEntrants.map(String));

  // Both selections in full, including what each one scored and which of the
  // two carries the margin. The league's round table shows a tip the way the
  // dashboard does - team, margin, and whether it came off - rather than a
  // total that says two of the picks were right without saying which.
  //
  // A paid round's departed entrants' tips come too, for the placings only.
  const tips = await db.Tip.find({
    season,
    round,
    user: { $in: paid ? [...ids, ...paidEntrants] : ids },
  }).select(
    "user correctTips topEightSelection bottomTenSelection " +
      "topEightCorrect bottomTenCorrect marginTopEight marginBottomTen " +
      "topEightDifference bottomTenDifference"
  );

  const byUser = new Map(tips.map((t) => [String(t.user), t]));

  const entered = tips
    .filter((tip) => !paid || entrantIds.has(String(tip.user)))
    .map((tip) => ({
      user: tip.user,
      correctTips: tip.correctTips || 0,
      countedDifference: marginDifference(tip),
    }));

  // Nothing is decided until a game has been played, and that is not only a
  // matter of privacy. Before the bounce every entrant has zero correct tips
  // and no margin, so pickWinners finds them all level and returns the lot: the
  // round names everybody as its winner and splits the pool between them, and
  // the dashboard prints it. Naming no winner is both the honest answer and the
  // correct one.
  const decided = pays && showSelections;

  // What each current member was paid, through the one reader of results -
  // which leaves out anybody no longer in the league.
  const paidTo = paid
    ? new Map(
        (await resultsFor(league, season, present))
          .filter((r) => r.round === round && r.winnings > 0)
          .map((r) => [String(r.user), r.winnings])
      )
    : null;

  const winners = paid
    ? new Set(paidTo.keys())
    : decided
      ? new Set(pickWinners(entered).map(String))
      : new Set();
  const entrants = paid ? paidEntrants.length : entered.length;
  const share = paid
    ? poolShare(entrants, pickWinners(entered).length)
    : decided
      ? poolShare(entrants, winners.size)
      : 0;

  // Same reason: everyone is level on nothing, so a ranking would put "=1."
  // against every name in the league.
  const places = showSelections ? rankRound(entered) : new Map();

  const standings = withUser.map((m) => {
    const id = String((m.user && m.user._id) || m.user);
    const inRound = countsFor(from, (m.user && m.user._id) || m.user, round);
    // Only for a round they were in. Somebody who left after a paid round and
    // has since rejoined has a tip there, fetched for the placings, and is not
    // in that round now.
    const tip = inRound ? byUser.get(id) : undefined;
    const placing = inRound ? places.get(id) : undefined;

    // A tip that exists and may be shown. Before the round bounces there is a
    // tip and it is nobody else's business: the row stays, because who has
    // entered is not the secret, and the picks are left out of the answer
    // rather than sent and hidden by the page.
    const open = tip && showSelections;

    return {
      user: id,
      username: m.user && m.user.username,
      // Three ways to have no result, and they mean different things: not in
      // the league yet, in it and did not tip, or in it and tipped.
      status: !inRound ? "beforeYou" : tip ? "entered" : "noTip",
      joinedAtRound: m.joinedAtRound,
      topEightSelection: open ? tip.topEightSelection : null,
      bottomTenSelection: open ? tip.bottomTenSelection : null,
      // 1, 0.5 or 0 per selection, and null where the game has not been played
      // - which the table reads to leave a cell uncoloured rather than marking
      // it wrong.
      topEightCorrect: open ? tip.topEightCorrect : null,
      bottomTenCorrect: open ? tip.bottomTenCorrect : null,
      // The margin sits against whichever selection it was put on, and only
      // one of the two ever carries one.
      marginTopEight: open ? tip.marginTopEight : null,
      marginBottomTen: open ? tip.marginBottomTen : null,
      correctTips: open ? tip.correctTips : null,
      marginError: open ? marginDifference(tip) : null,
      rank: placing ? placing.rank : null,
      tied: placing ? placing.tied : false,
      won: winners.has(id),
      winnings: paid ? paidTo.get(id) || 0 : winners.has(id) ? share : 0,
    };
  });

  // In the order the round finished, not the order people joined the league.
  //
  // Everyone who played, best first; then the members who sat it out, who have
  // no place in a round they were not in; then the ones who had not joined yet,
  // who were not in it at all. Membership order is meaningless to a reader and
  // is what the map above happens to produce.
  const order = { entered: 0, noTip: 1, beforeYou: 2 };
  standings.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.rank || Infinity) - (b.rank || Infinity) ||
      String(a.username || "").localeCompare(String(b.username || ""))
  );

  return {
    league: league.slug,
    name: league.name,
    type: league.type,
    round,
    // Nobody in the league tipped. A round with no entrants is not a round
    // anyone lost - it had no pool at all.
    status: entrants ? "scored" : "noEntries",
    startRound: league.startRound,
    // Whether the round carries a pool at all, so the page knows not to draw a
    // money column on a season league rather than drawing one full of zeroes.
    pays,
    buyIn: league.buyIn,
    entrants,
    share,
    winners: standings.filter((s) => s.won).map((s) => s.username),
    standings,
  };
};

// Every weekly league, after a sync has scored the tips themselves.
//
// Season-type leagues are skipped: they have no per-round pool, so there is
// nothing to write for them.
const scoreAllWeekly = async (season) => {
  const leagues = await db.League.find({ type: "weekly", deletedAt: null });

  const results = [];
  for (const league of leagues) {
    results.push(await scoreSeason(league, season));
  }

  return {
    leagues: results.length,
    rounds: results.reduce((n, r) => n + r.rounds, 0),
    skipped: results.reduce((n, r) => n + (r.skipped || 0), 0),
  };
};

// Ranking a pool league, pulled out of the query above so the rule can be
// tested without a database - the same shape rankSeason has on the season
// side.
//
// Winnings first, then balance. `net` is the balance in pool units - winnings
// minus entries - which the client multiplies by the buy-in for dollars.
//
// Winnings alone tied a member who had entered no rounds with one who had
// entered a round and won nothing. Both had won nothing, but one was a buy-in
// down and the other had not paid anything, so they were never level.
//
// Balance only ever separates people already equal on winnings. Ranking on it
// outright would be worse: it would lift someone who never entered above
// everyone who played and finished behind.
const rankWeekly = (entries) => {
  const sorted = entries
    .map((entry) => ({ ...entry, net: entry.winnings - entry.entries }))
    .sort(
      (a, b) =>
        b.winnings - a.winnings ||
        b.net - a.net ||
        String(a.username || "").localeCompare(String(b.username || ""))
    );

  // Competition ranking, as on the season ladder: equals share a place and the
  // next place skips past them.
  let rank = 0;
  let previous = null;

  return sorted.map((entry, index) => {
    const level =
      previous !== null &&
      previous.winnings === entry.winnings &&
      previous.net === entry.net;
    if (!level) rank = index + 1;
    previous = entry;
    return { ...entry, rank, tied: level };
  });
};

// Every stored result that still belongs to somebody in this league.
//
// The only place LeagueRoundResult is read. Everything else goes through this,
// and services/leagueRounds.readers.test.js fails if anything starts reading
// the collection directly again.
//
// It exists because a plain query returns strangers. A row is written for every
// member who tipped a round, and nothing removes it when they leave - which is
// deliberate rather than an oversight: the member-removal route in
// routes/leagues.js keeps a departed member's results, on the grounds that the
// league's history is a record of rounds that were played and removing somebody
// does not unplay them. The consequence is a collection holding rows nobody in
// the league owns any more. One local league carries 25 of them for a single
// departed member, three of which pay out.
//
// Two filters, because they answer different questions and neither implies the
// other:
//
//   - Membership, which countsFor cannot answer. Its permissive default - an
//     unknown member counts for everything - is right where it is used on tips,
//     and exactly wrong here, where an unknown member is somebody who left.
//   - The joining round, for a member who is in the league now but was not yet
//     when the round was played.
const resultsFor = async (league, season, members) => {
  const present = (
    members ||
    (await db.LeagueMembership.find({ league: league._id }).populate({
      path: "user",
      select: "username",
    }))
  ).filter((m) => m.user);

  const rows = await db.LeagueRoundResult.find({
    league: league._id,
    season,
  }).select("user round winnings");

  // memberFrom holds an entry per current member, so it answers the membership
  // question as well as the window one - one list rather than two that could
  // drift apart.
  const from = memberFrom(present, league, season);

  return rows.filter(
    (row) => from.has(String(row.user)) && countsFor(from, row.user, row.round)
  );
};

// The table for a weekly league: what each member has won, and what they have
// put in.
//
// Both are in buy-in units, so the client multiplies by the buy-in it was
// given rather than knowing the number itself. Net is winnings minus entries -
// a member who has tipped every round and won none is down by the number of
// rounds they entered.
const weeklyStandings = async (league, season) => {
  const rounds = await eligibleRounds(league, season);

  const members = await db.LeagueMembership.find({
    league: league._id,
  }).populate({ path: "user", select: "username" });

  const present = members.filter((m) => m.user);

  const results = await resultsFor(league, season, present);

  const totals = new Map();
  present.forEach((m) =>
    totals.set(String(m.user._id), {
      user: m.user._id,
      username: m.user.username,
      entries: 0,
      winnings: 0,
    })
  );

  results.forEach((row) => {
    const entry = totals.get(String(row.user));

    // resultsFor has already dropped everything that does not belong to a
    // current member, so on the path above this cannot fire. It is not dead
    // code though, and mutation testing is what settled the argument: put the
    // raw query back in place of resultsFor and this line is the only thing
    // keeping a departed member's winnings out of the table. Second layer, and
    // cheaper than a TypeError on somebody's leaderboard.
    if (!entry) return;

    // A result exists for every member who tipped that round, winner or not,
    // so the row count is the entry count.
    entry.entries += 1;
    entry.winnings += row.winnings || 0;
  });

  return { season, rounds, standings: rankWeekly([...totals.values()]) };
};

module.exports = {
  scoreRound,
  scoreSeason,
  scoreAllWeekly,
  weeklyStandings,
  resultsFor,
  roundDetail,
  rankWeekly,
  rankRound,
  rankableDifference,
  poolShare,
};

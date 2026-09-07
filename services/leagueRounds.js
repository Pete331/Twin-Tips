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
const scoreRound = async (league, season, round, members) => {
  const present =
    members || (await db.LeagueMembership.find({ league: league._id }));
  const ids = present.map((m) => m.user);

  // Who was in the league for this round. Someone who joined at round 15 has
  // tips from round 1 - they are real tips and they count on the global ladder,
  // but this league's pool is not theirs to enter or to win.
  const from = memberFrom(present, league, season);

  const all = await db.Tip.find({
    season,
    round,
    user: { $in: ids },
  }).select(
    "user correctTips marginTopEight topEightDifference bottomTenDifference"
  );

  const tips = all.filter((tip) => countsFor(from, tip.user, round));

  // Nobody in this league tipped. No pool, and nothing to write - a round with
  // no entrants is not a round anyone lost.
  if (!tips.length) {
    return { round, entrants: 0, winners: [], share: 0 };
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
// It also stops a settled round being re-priced. scoreRound divides the pool
// by however many members tipped, and only ever upserts - it never removes a
// row. So when somebody leaves a league, an unbounded re-score recomputes every
// past round with a smaller pool and pays the remaining members more for rounds
// that settled months ago. A round decided among five entrants should stay
// decided among five.
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

  const due = rounds.filter((r) => r <= lastComplete);

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
const roundDetail = async (league, season, round, members) => {
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

  const tips = await db.Tip.find({ season, round, user: { $in: ids } }).select(
    "user correctTips marginTopEight topEightSelection bottomTenSelection " +
      "topEightDifference bottomTenDifference"
  );

  const byUser = new Map(tips.map((t) => [String(t.user), t]));

  const entered = tips.map((tip) => ({
    user: tip.user,
    correctTips: tip.correctTips || 0,
    countedDifference: marginDifference(tip),
  }));

  // Only a weekly league has a pool each round. A season league is one contest
  // running all year, so its rounds have a best performance but no winner and
  // nothing to pay - saying otherwise would put a payout on a table where
  // nobody has staked anything.
  //
  // The ranking below is worked out either way: who did best in a round is
  // worth seeing whichever kind of league it is, which is the whole reason
  // these tables show opponents' tips.
  const pays = league.type === "weekly";
  const winners = pays
    ? new Set(pickWinners(entered).map(String))
    : new Set();
  const share = pays ? poolShare(entered.length, winners.size) : 0;

  // Ranked on the round's own rule - most correct tips, then the closest
  // margin - rather than on the money, so somebody who came second in a round
  // nobody won still reads as second.
  const ranked = [...entered].sort(
    (a, b) =>
      b.correctTips - a.correctTips ||
      rankableDifference(a.countedDifference) -
        rankableDifference(b.countedDifference)
  );

  let place = 0;
  let previous = null;
  const places = new Map();

  ranked.forEach((entry, index) => {
    const level =
      previous !== null &&
      previous.correctTips === entry.correctTips &&
      previous.countedDifference === entry.countedDifference;
    if (!level) place = index + 1;
    previous = entry;
    places.set(String(entry.user), { rank: place, tied: level });
  });

  const standings = withUser.map((m) => {
    const id = String((m.user && m.user._id) || m.user);
    const tip = byUser.get(id);
    const placing = places.get(id);
    const inRound = countsFor(from, (m.user && m.user._id) || m.user, round);

    return {
      user: id,
      username: m.user && m.user.username,
      // Three ways to have no result, and they mean different things: not in
      // the league yet, in it and did not tip, or in it and tipped.
      status: !inRound ? "beforeYou" : tip ? "entered" : "noTip",
      joinedAtRound: m.joinedAtRound,
      topEightSelection: tip ? tip.topEightSelection : null,
      bottomTenSelection: tip ? tip.bottomTenSelection : null,
      correctTips: tip ? tip.correctTips : null,
      marginError: tip ? marginDifference(tip) : null,
      rank: placing ? placing.rank : null,
      tied: placing ? placing.tied : false,
      won: winners.has(id),
      winnings: winners.has(id) ? share : 0,
    };
  });

  return {
    league: league.slug,
    name: league.name,
    type: league.type,
    round,
    // Nobody in the league tipped. A round with no entrants is not a round
    // anyone lost - it had no pool at all.
    status: entered.length ? "scored" : "noEntries",
    startRound: league.startRound,
    // Whether the round carries a pool at all, so the page knows not to draw a
    // money column on a season league rather than drawing one full of zeroes.
    pays,
    buyIn: league.buyIn,
    entrants: entered.length,
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

  const results = await db.LeagueRoundResult.find({
    league: league._id,
    season,
  }).select("user round winnings");

  const totals = new Map();
  present.forEach((m) =>
    totals.set(String(m.user._id), {
      user: m.user._id,
      username: m.user.username,
      entries: 0,
      winnings: 0,
    })
  );

  const from = memberFrom(present, league, season);

  results.forEach((row) => {
    const entry = totals.get(String(row.user));
    // A result belonging to someone who has since left the league.
    if (!entry) return;

    // Filtered here as well as in scoreRound, which is not belt and braces.
    // scoreRound stops writing these rows, but it does not remove the ones it
    // already wrote - so a league scored before this existed still holds
    // entries against rounds its members had not joined. Reading past them
    // corrects the table without a migration.
    if (!countsFor(from, row.user, row.round)) return;

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
  roundDetail,
  rankWeekly,
  rankableDifference,
  poolShare,
};

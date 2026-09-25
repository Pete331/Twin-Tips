// The global ladder: every user, season-ladder scoring, shown once signed in.
//
// Same rules as a league's season ladder - correct tips across the
// home-and-away rounds, closest cumulative margin as the tiebreak - with no
// membership filter and no start round. Someone who signed up and never joined
// a league still appears.
//
// Cached in MongoDB rather than in memory. Render's free tier spins the service
// down and restarts it often, so an in-process cache would be cold again by the
// next visitor - which is exactly the case the cache exists for - and it would
// not survive a deploy either.

const db = require("../models");
const seasonService = require("./season");
const {
  rankSeason,
  tallySeason,
  homeAndAwayRounds,
  hasEntered,
} = require("./leagueStandings");
// The round's ranking rule, shared with a league's round table rather than
// copied - two copies of a tie rule is how the two tables would come to
// disagree about who drew with whom.
const { rankRound } = require("./leagueRounds");
const { marginDifference } = require("./results");

// A deleted account is kept, not removed - its tips are part of rounds other
// people played and were paid for (see DELETE /api/deleteUser). It belongs in
// those rounds, as a former player, and nowhere else: not listed as sitting
// out every round after it left, and not counted as registered.
const stillHere = (user, tipped) =>
  !user.deletedAt || tipped.has(String(user._id));

// Everyone who belongs on a table built from these tips, shaped the way
// tallySeason expects a membership list. The global ladder is the same
// computation over a different population, so it reuses the same two
// functions rather than growing a second copy of the rules.
const everyone = async (tips) => {
  const tipped = new Set(tips.map((t) => String(t.user)));
  const users = await db.User.find({}).select("username deletedAt");
  return users
    .filter((user) => stillHere(user, tipped))
    .map((user) => ({ user }));
};

// Recompute from tips and store the result. Returns the standings.
const refresh = async (season, throughRound) => {
  const rounds = await homeAndAwayRounds(season);

  const tips = rounds.length
    ? await db.Tip.find({ season, round: { $in: rounds } }).select(
        "user round correctTips marginTopEight topEightDifference bottomTenDifference"
      )
    : [];

  const members = await everyone(tips);

  const standings = rankSeason(tallySeason(members, tips));

  await db.GlobalLadder.findOneAndUpdate(
    { season },
    {
      $set: {
        throughRound,
        computedAt: new Date(),
        standings: standings.map((s) => ({
          user: s.user,
          correctTips: s.correctTips,
          marginError: s.marginError,
          roundsTipped: s.roundsTipped,
        })),
      },
    },
    { upsert: true }
  );

  return { season, throughRound, standings, rebuilt: true };
};

// The last round of the season whose games have all been played. This is what
// the snapshot is measured against: while it does not move, the ladder cannot
// change, because a round is only scored once it is complete.
const currentThroughRound = async (season) => {
  const state = await seasonService.getSeasonState(season);
  return state.lastCompletedRound !== null &&
    state.lastCompletedRound !== undefined
    ? state.lastCompletedRound
    : -1;
};

// The ladder, less the people who have not played.
//
// A league table lists its members whether they have tipped or not, and should:
// membership is something you opted into, the roll-call is half of what the
// table is for, and a league that hides its own members until they score is
// worse than one with zeroes in it. This is not that table. Its population is
// db.User.find({}) - every account ever registered - so nobody is "in" it, and
// a signup from three seasons ago that never entered a round is not a
// participant sitting on nothing. It is just an account.
//
// Filtered here on the way out rather than in refresh, so the stored ladder
// keeps every row. Nothing is lost, the decision stays reversible, and
// registered is the count that used to be carried by thirty empty rows - the
// page can say "9 of 34" instead of printing the other twenty-five.
//
// The same predicate the ranking demotes on, imported rather than restated,
// because two opinions about what counts as having played is how a ladder
// comes to hide somebody it also ranks.
const playersOnly = (standings) => ({
  standings: standings.filter(hasEntered),
  registered: standings.length,
});

// The ladder for a season, from the snapshot where it is current.
//
// Rebuilds on read when the snapshot is behind - a missed sync, or a round
// scored while the service was down. Without that, one missed cron would leave
// a permanently wrong homepage and nothing would say so. The write-on-round-
// completion path is the fast case, not the only one.
const get = async (requestedSeason) => {
  const season = Number.isInteger(requestedSeason)
    ? requestedSeason
    : (await seasonService.getSeasonState()).season;

  const throughRound = await currentThroughRound(season);
  const cached = await db.GlobalLadder.findOne({ season }).populate({
    path: "standings.user",
    select: "username deletedAt",
  });

  if (cached && cached.throughRound === throughRound) {
    return {
      season,
      throughRound,
      computedAt: cached.computedAt,
      rebuilt: false,
      // Ranked on the way out rather than stored with ranks, so the numbering
      // rule lives in one place and a stored ladder cannot disagree with a
      // freshly computed one.
      ...playersOnly(
        rankSeason(
          cached.standings
            // A user removed since the snapshot was taken - or, now that an
            // account is anonymised rather than removed, deleted without
            // having played. The snapshot is only rebuilt when a round
            // finishes, so it can be holding either.
            .filter(
              (row) => row.user && (!row.user.deletedAt || hasEntered(row))
            )
            .map((row) => ({
              user: row.user._id,
              username: row.user.username,
              correctTips: row.correctTips,
              marginError: row.marginError,
              roundsTipped: row.roundsTipped,
            }))
        )
      ),
    };
  }

  const fresh = await refresh(season, throughRound);
  // Spread after fresh, so its unfiltered standings are replaced rather than
  // sitting beside the filtered ones.
  return { ...fresh, ...playersOnly(fresh.standings), computedAt: new Date() };
};

// One round, over everybody.
//
// The site ladder's answer to the question a league answers with
// leagueRounds.roundDetail: who tipped this round, what they picked, and where
// they came. Same ranking rule - shared, not copied - and the same shape, so
// the leaderboard draws it with the table it already has.
//
// Two differences, both because there is no membership:
//
//   - Everybody appears, which is the population the season ladder above uses.
//     Somebody who never tipped is "noTip", exactly as a league member who sat
//     a round out is.
//   - There is no "beforeYou". Nobody joins the site ladder at a round; you are
//     on it from the day you register.
//
// The money is read rather than recomputed. services/results.js settles the
// site-wide pool when it scores a round and writes each share onto the tip, so
// working it out again here would be a second opinion about a payout already
// made - and the two would part company the first time the rule changed. There
// is no buy-in on this pool, so buyIn is 0 and the page names the winner
// without inventing a figure.
const roundDetail = async (
  requestedSeason,
  round,
  { showSelections = true } = {}
) => {
  const season = Number.isInteger(requestedSeason)
    ? requestedSeason
    : (await seasonService.getSeasonState()).season;

  const tips = await db.Tip.find({ season, round }).select(
    "user correctTips topEightSelection bottomTenSelection " +
      "topEightCorrect bottomTenCorrect marginTopEight marginBottomTen " +
      "topEightDifference bottomTenDifference winnings"
  );

  const byUser = new Map(tips.map((t) => [String(t.user), t]));

  const users = (await db.User.find({}).select("username deletedAt")).filter(
    (user) => stillHere(user, byUser)
  );

  const entered = tips.map((tip) => ({
    user: tip.user,
    correctTips: tip.correctTips || 0,
    countedDifference: marginDifference(tip),
  }));

  // Whether the round's results are in: every tip scored. The same test and
  // the same reason as leagueRounds.roundDetail - tips are scored all at once
  // when the round's last game is over, and until then everyone reads as
  // level on nothing (UX audit finding #2).
  const resultsIn =
    tips.length > 0 && tips.every((tip) => Number.isFinite(tip.correctTips));

  const places = resultsIn ? rankRound(entered) : new Map();

  const standings = users.map((user) => {
    const id = String(user._id);
    const tip = byUser.get(id);
    const placing = places.get(id);

    // Before the bounce there is a tip and it is nobody else's business. The
    // row still appears - who has entered is not the secret - but the picks and
    // the margins are left out of the response rather than sent and hidden.
    const open = tip && showSelections;

    return {
      user: id,
      username: user.username,
      status: tip ? "entered" : "noTip",
      topEightSelection: open ? tip.topEightSelection : null,
      bottomTenSelection: open ? tip.bottomTenSelection : null,
      topEightCorrect: open ? tip.topEightCorrect : null,
      bottomTenCorrect: open ? tip.bottomTenCorrect : null,
      marginTopEight: open ? tip.marginTopEight : null,
      marginBottomTen: open ? tip.marginBottomTen : null,
      correctTips: open ? tip.correctTips : null,
      marginError: open ? marginDifference(tip) : null,
      // Blank while the picks are, and not only for tidiness. Nothing is
      // decided before the bounce: no game has been played, so every entrant
      // has null correct tips and null margin, they all rank level, and the
      // table would read "=1." against every name in the competition.
      rank: open && placing ? placing.rank : null,
      tied: Boolean(open && placing && placing.tied),
      won: Boolean(open && tip.winnings > 0),
      winnings: open ? tip.winnings || 0 : 0,
    };
  });

  // Finishing order, then the people who sat it out, then by name - the same
  // order a league's round table uses, so the two read alike.
  const order = { entered: 0, noTip: 1 };
  standings.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.rank || Infinity) - (b.rank || Infinity) ||
      String(a.username || "").localeCompare(String(b.username || ""))
  );

  return {
    season,
    round,
    // "open": not started, tips still going in. "pending": under way, picks
    // out and results not in. See leagueRounds.roundDetail for both.
    status: !showSelections
      ? "open"
      : !entered.length
        ? "noEntries"
        : !resultsIn
          ? "pending"
          : "scored",
    // Everyone on the site ladder, tipped or not.
    members: users.length,
    // There is a pool every round, so this table does have a winner to name -
    // unlike a season-type league, where saying "winner" would imply a payout
    // nobody staked.
    pays: true,
    // No buy-in on the site pool. The share is in entrants' stakes and there is
    // no dollar value to put on it, which the page reads to leave the money
    // column off rather than print $0.00 down it.
    buyIn: 0,
    entrants: entered.length,
    winners: standings.filter((s) => s.won).map((s) => s.username),
    standings,
  };
};

module.exports = { get, refresh, currentThroughRound, roundDetail };

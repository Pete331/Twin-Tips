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
} = require("./leagueStandings");

// Everyone, shaped the way tallySeason expects a membership list. The global
// ladder is the same computation over a different population, so it reuses the
// same two functions rather than growing a second copy of the rules.
const everyone = async () => {
  const users = await db.User.find({}).select("username");
  return users.map((user) => ({ user }));
};

// Recompute from tips and store the result. Returns the standings.
const refresh = async (season, throughRound) => {
  const rounds = await homeAndAwayRounds(season);
  const members = await everyone();

  const tips = rounds.length
    ? await db.Tip.find({ season, round: { $in: rounds } }).select(
        "user round correctTips marginTopEight topEightDifference bottomTenDifference"
      )
    : [];

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
    select: "username",
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
      standings: rankSeason(
        cached.standings
          // A user deleted since the snapshot was taken.
          .filter((row) => row.user)
          .map((row) => ({
            user: row.user._id,
            username: row.user.username,
            correctTips: row.correctTips,
            marginError: row.marginError,
          }))
      ),
    };
  }

  const fresh = await refresh(season, throughRound);
  return { ...fresh, computedAt: new Date() };
};

module.exports = { get, refresh, currentThroughRound };

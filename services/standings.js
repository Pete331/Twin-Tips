// Picking the right ladder for a round.
//
// Twin Tips is played against the ladder as it stood when the round opened, so
// tipping round N is judged against the snapshot taken after round N-1. Fixing
// it that way means a late-finishing game cannot move a team between the top 8
// and the bottom 10 after someone has already tipped, and looking back at an
// old round shows the split that actually applied at the time.

const db = require("../models");

// The ladder to use when tipping `round` of `year`: the snapshot after the
// previous round. Falls back progressively, because the first round of a season
// has no preceding round in that season - which is what the old code's
// "currentRound !== 1" special case was working around by hand.
const getLadderForRound = async (year, round) => {
  if (!Number.isInteger(year) || !Number.isInteger(round)) return [];

  // The snapshot taken after the previous round.
  const previous = await db.Standing.find({ year, round: round - 1 }).sort({
    rank: 1,
  });
  if (previous.length) return previous;

  // No exact match - use the most recent snapshot in this season that predates
  // the round, which covers gaps if a round's sync was missed.
  const earlier = await db.Standing.find({
    year,
    round: { $lt: round },
  })
    .sort({ round: -1, rank: 1 })
    .limit(200);
  if (earlier.length) {
    const latestRound = earlier[0].round;
    return earlier
      .filter((s) => s.round === latestRound)
      .sort((a, b) => a.rank - b.rank);
  }

  // Start of a season: fall back to where the previous season finished.
  const lastSeason = await db.Standing.find({ year: { $lt: year } })
    .sort({ year: -1, round: -1 })
    .limit(1);
  if (!lastSeason.length) return [];

  return db.Standing.find({
    year: lastSeason[0].year,
    round: lastSeason[0].round,
  }).sort({ rank: 1 });
};

// Team id -> ladder row, for attaching ranks to a round's fixtures.
const getLadderMap = async (year, round) => {
  const ladder = await getLadderForRound(year, round);
  const map = new Map();
  ladder.forEach((row) => map.set(row.id, row));
  return map;
};

// Which rounds of a season already have a ladder snapshot.
const getStoredRounds = async (year) => {
  const rounds = await db.Standing.distinct("round", { year });
  return rounds.filter((r) => Number.isInteger(r)).sort((a, b) => a - b);
};

module.exports = { getLadderForRound, getLadderMap, getStoredRounds };

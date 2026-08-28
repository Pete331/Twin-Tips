// Season ladder standings for a league.
//
// One long contest: correct tips accumulate across the home-and-away rounds,
// and the closest cumulative margin separates anyone level on them.
//
// The scoring itself is not reimplemented here. correctTips is already on each
// tip, and the margin comes from marginDifference in services/results.js -
// which knows which of the two selections the margin was entered against. That
// rule was written out twice once before, the copies drifted, and round 19
// went to the wrong tipster. There is one copy.

const db = require("../models");
const { marginDifference } = require("./results");
const { isFinalsFixture } = require("./season");

// Every home-and-away round of a season, in order.
//
// Home-and-away only, because the competition needs a bottom 10 to pick from
// and the finals do not have one. Derived from the fixtures rather than
// assuming the finals are whatever comes after round 24.
//
// Shared with the global ladder, which scores the same rounds but without a
// league's start round.
const homeAndAwayRounds = async (season) => {
  const fixtures = await db.Fixture.find({ year: season }).select(
    "round is_final roundname"
  );

  return [
    ...new Set(fixtures.filter((f) => !isFinalsFixture(f)).map((f) => f.round)),
  ].sort((a, b) => a - b);
};

// The rounds that count for one league.
//
// startRound applies only to the season the league was created in, where its
// job is stopping a league created in round 15 from claiming tips entered
// before it existed. Later seasons start at their own first round.
const eligibleRounds = async (league, season) => {
  const rounds = await homeAndAwayRounds(season);
  if (!rounds.length) return [];

  const from = season === league.createdSeason ? league.startRound : rounds[0];

  return rounds.filter((round) => round >= from);
};

// Sorts and numbers a season ladder. Pure, so the ordering can be tested
// without a database.
//
// Competition ranking: everyone level shares a place and the next place skips
// past them, so two players tied first are both 1st and the next is 3rd.
const rankSeason = (entries) => {
  const sorted = [...entries].sort(
    (a, b) =>
      b.correctTips - a.correctTips ||
      a.marginError - b.marginError ||
      String(a.username || "").localeCompare(String(b.username || ""))
  );

  let rank = 0;
  let previous = null;

  return sorted.map((entry, index) => {
    const level =
      previous !== null &&
      previous.correctTips === entry.correctTips &&
      previous.marginError === entry.marginError;

    if (!level) rank = index + 1;
    previous = entry;

    return { ...entry, rank, tied: level };
  });
};

// Totals per member. Every member appears, including someone who has not
// tipped a round yet - a league table that hides its own members until they
// score is worse than one with zeroes in it.
const tallySeason = (members, tips) => {
  const totals = new Map();

  members.forEach((member) => {
    totals.set(String(member.user._id || member.user), {
      user: member.user._id || member.user,
      username: member.user.username || null,
      correctTips: 0,
      marginError: 0,
      roundsTipped: 0,
    });
  });

  tips.forEach((tip) => {
    const entry = totals.get(String(tip.user));
    // A tip from someone who has since left the league.
    if (!entry) return;

    entry.correctTips += tip.correctTips || 0;
    entry.roundsTipped += 1;

    // A tip whose margin cannot be counted - the game was not found, or the
    // tip predates margins being required - adds nothing. Worth knowing that
    // this flatters them slightly on the tiebreak, in the same way the spec
    // accepts for a player who simply tipped fewer rounds. Every tip written
    // since the server started validating carries a margin, so this only
    // reaches historical rows.
    const difference = marginDifference(tip);
    if (difference !== null) entry.marginError += difference;
  });

  return [...totals.values()];
};

const seasonLadder = async (league, season) => {
  const rounds = await eligibleRounds(league, season);

  const members = await db.LeagueMembership.find({
    league: league._id,
  }).populate({ path: "user", select: "username" });

  // A membership whose user has since deleted their account.
  const present = members.filter((m) => m.user);

  if (!rounds.length || !present.length) {
    return { season, rounds: [], standings: rankSeason(tallySeason(present, [])) };
  }

  const tips = await db.Tip.find({
    season,
    round: { $in: rounds },
    user: { $in: present.map((m) => m.user._id) },
  }).select(
    "user round correctTips marginTopEight topEightDifference bottomTenDifference"
  );

  return {
    season,
    rounds,
    standings: rankSeason(tallySeason(present, tips)),
  };
};

module.exports = {
  seasonLadder,
  rankSeason,
  tallySeason,
  eligibleRounds,
  homeAndAwayRounds,
};

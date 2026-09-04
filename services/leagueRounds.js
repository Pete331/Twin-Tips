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
const { pickWinners, marginDifference } = require("./results");
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
const scoreSeason = async (league, season) => {
  const rounds = await eligibleRounds(league, season);
  const state = await seasonService.getSeasonState(season);
  const lastComplete =
    state.lastCompletedRound !== null && state.lastCompletedRound !== undefined
      ? state.lastCompletedRound
      : -1;

  // The memberships themselves rather than their ids: scoreRound needs
  // joinedAtRound to know whose round this was.
  const members = await db.LeagueMembership.find({ league: league._id });

  const done = [];
  for (const round of rounds.filter((r) => r <= lastComplete)) {
    done.push(await scoreRound(league, season, round, members));
  }

  return {
    league: league.slug,
    season,
    rounds: done.length,
    entrants: done.reduce((n, r) => n + r.entrants, 0),
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
  rankWeekly,
  poolShare,
};

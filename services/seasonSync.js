// Loads a season's data from Squiggle into MongoDB.
//
// This used to happen in the browser: DashboardPage noticed the standings were
// stale, downloaded them from Squiggle, and POSTed them back to endpoints that
// begin with deleteMany. That made every signed-in visitor capable of wiping
// shared data, and it stopped working entirely once Squiggle began refusing
// browser requests. Doing it here keeps the privileged writes on the server.

const db = require("../models");
const squiggle = require("./squiggle");
const standings = require("./standings");

const syncTeams = async () => {
  const { teams } = await squiggle.query("teams");
  if (!Array.isArray(teams) || !teams.length) {
    throw new Error("Squiggle returned no teams");
  }

  await Promise.all(
    teams.map((team) =>
      db.Team.updateOne({ id: team.id }, { $set: team }, { upsert: true })
    )
  );

  return teams.length;
};

// Stores the ladder as it stood after a given round. Squiggle serves historical
// ladders via ?q=standings;year=Y;round=N, so past rounds can be backfilled.
const syncStandingsForRound = async (year, round) => {
  const { standings } = await squiggle.query("standings", { year, round });
  if (!Array.isArray(standings) || !standings.length) {
    // No ladder yet - before a season starts, for instance. Not a failure.
    return 0;
  }

  await Promise.all(
    standings.map((team) =>
      db.Standing.updateOne(
        { year, round, id: team.id },
        { $set: { ...team, year, round } },
        { upsert: true }
      )
    )
  );

  return standings.length;
};

// A round is done when every fixture in it has finished.
const completedRounds = (fixtures) => {
  const byRound = new Map();
  fixtures.forEach((f) => {
    if (!byRound.has(f.round)) byRound.set(f.round, []);
    byRound.get(f.round).push(f);
  });

  return [...byRound.entries()]
    .filter(([, games]) => games.every((g) => Number(g.complete) === 100))
    .map(([round]) => round)
    .sort((a, b) => a - b);
};

// Captures a ladder snapshot for every completed round that doesn't have one.
// This is what the 3-day timer in the dashboard was standing in for: rounds run
// about a week, so a 3-day check fired mid-round as often as not, shifting the
// top-8/bottom-10 split under people who had already tipped.
const syncStandingsForCompletedRounds = async (year) => {
  const fixtures = await db.Fixture.find({ year }).select("round complete");
  const done = completedRounds(fixtures);
  const stored = await standings.getStoredRounds(year);
  const missing = done.filter((r) => !stored.includes(r));

  let captured = 0;
  for (const round of missing) {
    // Sequential rather than parallel: Squiggle ask callers not to fire large
    // numbers of simultaneous requests.
    const n = await syncStandingsForRound(year, round);
    if (n) captured += 1;
  }

  return { completed: done.length, captured, rounds: missing };
};

const syncGames = async (year) => {
  const { games } = await squiggle.query("games", { year });
  if (!Array.isArray(games) || !games.length) {
    throw new Error(`Squiggle returned no games for ${year}`);
  }

  // Upsert by Squiggle's game id rather than deleting the season first, so a
  // failure part-way through cannot leave the season empty.
  await Promise.all(
    games.map((game) =>
      db.Fixture.updateOne({ id: game.id }, { $set: game }, { upsert: true })
    )
  );

  return games.length;
};

const syncSeason = async (year) => {
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid season: ${year}`);
  }

  const teams = await syncTeams();
  const games = await syncGames(year);
  // Games first: which rounds are complete is read back from the fixtures we
  // have just stored.
  const ladders = await syncStandingsForCompletedRounds(year);

  return { year, teams, games, ladders };
};

module.exports = {
  syncSeason,
  syncTeams,
  syncGames,
  syncStandingsForRound,
  syncStandingsForCompletedRounds,
  completedRounds,
};

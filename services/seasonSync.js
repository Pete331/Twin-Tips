// Loads a season's data from Squiggle into MongoDB.
//
// This used to happen in the browser: DashboardPage noticed the standings were
// stale, downloaded them from Squiggle, and POSTed them back to endpoints that
// begin with deleteMany. That made every signed-in visitor capable of wiping
// shared data, and it stopped working entirely once Squiggle began refusing
// browser requests. Doing it here keeps the privileged writes on the server.

const db = require("../models");
const squiggle = require("./squiggle");

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

const syncStandings = async (year) => {
  const { standings } = await squiggle.query("standings", { year });
  if (!Array.isArray(standings) || !standings.length) {
    // Before a season starts there is no ladder yet; that is not a failure.
    return 0;
  }

  await Promise.all(
    standings.map((team) =>
      db.Standing.updateOne({ id: team.id }, { $set: team }, { upsert: true })
    )
  );

  return standings.length;
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
  const standings = await syncStandings(year);

  return { year, teams, games, standings };
};

module.exports = { syncSeason, syncTeams, syncGames, syncStandings };

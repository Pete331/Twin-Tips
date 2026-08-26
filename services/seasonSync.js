// Loads a season's data from Squiggle into MongoDB.
//
// This used to happen in the browser: DashboardPage noticed the standings were
// stale, downloaded them from Squiggle, and POSTed them back to endpoints that
// begin with deleteMany. That made every signed-in visitor capable of wiping
// shared data, and it stopped working entirely once Squiggle began refusing
// browser requests. Doing it here keeps the privileged writes on the server.

const fs = require("fs");
const path = require("path");
const db = require("../models");
const squiggle = require("./squiggle");
const standings = require("./standings");
const results = require("./results");
const season = require("./season");

// Logos are stored per team abbreviation, but abbrev is a display string
// Squiggle can change - Gold Coast went from GC to GCS, and the logo broke
// silently because a missing file fell through to the app shell rather than
// 404ing. Flag it at sync time instead of leaving it for someone to notice.
const LOGO_DIR = path.join(
  __dirname,
  "..",
  "client",
  "public",
  "assets",
  "team-logos"
);

const missingLogos = (teams) =>
  teams
    .filter((team) => team.abbrev)
    .filter((team) => !fs.existsSync(path.join(LOGO_DIR, `${team.abbrev}.svg`)))
    .map((team) => `${team.abbrev} (${team.name})`);

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

  const missing = missingLogos(teams);
  if (missing.length) {
    console.warn(
      `No logo file for: ${missing.join(", ")}. ` +
        `Add <abbrev>.svg to client/public/assets/team-logos.`
    );
  }

  return { count: teams.length, missingLogos: missing };
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
  const fixtures = await db.Fixture.find({ year })
    .select("round complete is_final roundname");
  const done = completedRounds(fixtures);
  const stored = await standings.getStoredRounds(year);

  // Finals rounds are skipped: Squiggle stops reporting a rank once they
  // start, so those snapshots arrive with every other field populated and no
  // ladder position - useless for deciding who is in the top 8, and they would
  // otherwise shadow the last real ladder when a later season falls back to
  // "where the previous season finished".
  const finalsRounds = new Set(
    fixtures.filter((f) => season.isFinalsFixture(f)).map((f) => f.round)
  );

  const missing = done.filter(
    (r) => !stored.includes(r) && !finalsRounds.has(r)
  );

  let captured = 0;
  for (const round of missing) {
    // Sequential rather than parallel: Squiggle ask callers not to fire large
    // numbers of simultaneous requests.
    const n = await syncStandingsForRound(year, round);
    if (n) captured += 1;
  }

  return { completed: done.length, captured, rounds: missing };
};

// Squiggle sends the kick-off three ways: `date` and `localtime` as bare
// strings with no zone, `tz` as the venue's offset, and `unixtime` as the
// actual instant. Letting the bare string be cast to a Date parses it in
// whatever zone the server happens to run in - two hours out on a machine in
// Perth, ten on a UTC host like Render - so the stored time depended on where
// the code was running. unixtime has no such ambiguity.
const fixtureDate = (game) => {
  if (Number.isFinite(Number(game.unixtime))) {
    return new Date(Number(game.unixtime) * 1000);
  }
  // Fall back to the local time plus the venue offset, which is still explicit.
  if (game.date && game.tz) {
    const parsed = new Date(`${game.date.replace(" ", "T")}${game.tz}`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const syncGames = async (year) => {
  const { games } = await squiggle.query("games", { year });
  if (!Array.isArray(games) || !games.length) {
    throw new Error(`Squiggle returned no games for ${year}`);
  }

  // Upsert by Squiggle's game id rather than deleting the season first, so a
  // failure part-way through cannot leave the season empty.
  await Promise.all(
    games.map((game) => {
      const date = fixtureDate(game);
      return db.Fixture.updateOne(
        { id: game.id },
        { $set: { ...game, ...(date ? { date } : {}) } },
        { upsert: true }
      );
    })
  );

  return games.length;
};

const syncSeason = async (year) => {
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid season: ${year}`);
  }

  const teamResult = await syncTeams();
  const games = await syncGames(year);
  // Games first: which rounds are complete is read back from the fixtures we
  // have just stored.
  const ladders = await syncStandingsForCompletedRounds(year);
  // Then scoring, which needs the finished fixtures. Ordering matters: a round
  // is only scored once every game in it has been played, so the scores have to
  // be in before this runs.
  const scored = await results.calculateSeason(year);

  return {
    year,
    teams: teamResult.count,
    missingLogos: teamResult.missingLogos,
    games,
    ladders,
    scored,
  };
};

module.exports = {
  syncSeason,
  syncTeams,
  syncGames,
  fixtureDate,
  syncStandingsForRound,
  syncStandingsForCompletedRounds,
  completedRounds,
};

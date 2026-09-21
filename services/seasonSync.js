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
const globalLadder = require("./globalLadder");
const leagueRounds = require("./leagueRounds");
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
    .filter((team) => !fs.existsSync(path.join(LOGO_DIR, `${team.abbrev}.png`)))
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
        `Add <abbrev>.png to client/public/assets/team-logos.`
    );
  }

  return { count: teams.length, missingLogos: missing };
};

// Stores the ladder as it stood after a given round. Squiggle serves historical
// ladders via ?q=standings;year=Y;round=N, so past rounds can be backfilled.
const syncStandingsForRound = async (year, round, provisional = false) => {
  const { standings } = await squiggle.query("standings", { year, round });
  if (!Array.isArray(standings) || !standings.length) {
    // No ladder yet - before a season starts, for instance. Not a failure.
    return 0;
  }

  await Promise.all(
    standings.map((team) =>
      db.Standing.updateOne(
        { year, round, id: team.id },
        { $set: { ...team, year, round, provisional } },
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

// How long after a fixture's scheduled bounce we stop expecting it to be
// played. The same day used by roundInProgress and by the ladder gate in
// getSeasonState, and for the same reason: no game lasts a day, so a fixture
// still unfinished after this is postponed, abandoned, or a sync that stopped.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Rounds we are willing to take a ladder from: finished, or started and no
// longer expected to finish.
//
// Completion alone was the rule, and one postponed game was enough to defeat
// it - the round never completes, so no snapshot is ever captured, and every
// later round falls back to a ladder from before it. That fallback is silent,
// and it decides who is in the top 8, so a legal tip gets refused and an
// illegal one accepted.
//
// A round counts as settled when every fixture is either finished or more than
// a day past its bounce. The ladder Squiggle serves for it is then the real one
// - it reflects the games that were actually played - and it is a great deal
// closer to the truth than the round before it.
const settledRounds = (fixtures, now = new Date()) => {
  const byRound = new Map();
  fixtures.forEach((f) => {
    if (!byRound.has(f.round)) byRound.set(f.round, []);
    byRound.get(f.round).push(f);
  });

  const settled = [];
  const provisional = new Set();

  for (const [round, games] of byRound.entries()) {
    if (games.every((g) => Number(g.complete) === 100)) {
      settled.push(round);
      continue;
    }

    // Nothing in the round has bounced yet: it is upcoming, not stuck.
    if (!games.some((g) => g.date && g.date <= now)) continue;

    const unfinished = games.filter((g) => Number(g.complete) !== 100);
    const allOverdue = unfinished.every(
      (g) => g.date && now - g.date > STALE_AFTER_MS
    );

    if (allOverdue) {
      settled.push(round);
      provisional.add(round);
    }
  }

  return { rounds: settled.sort((a, b) => a - b), provisional };
};

// Captures a ladder snapshot for every completed round that doesn't have one.
// This is what the 3-day timer in the dashboard was standing in for: rounds run
// about a week, so a 3-day check fired mid-round as often as not, shifting the
// top-8/bottom-10 split under people who had already tipped.
const syncStandingsForCompletedRounds = async (year, now = new Date()) => {
  const fixtures = await db.Fixture.find({ year })
    .select("round complete is_final roundname date");
  const { rounds: done, provisional } = settledRounds(fixtures, now);
  const stored = await standings.getStoredRounds(year);

  // Finals rounds are skipped: Squiggle stops reporting a rank once they
  // start, so those snapshots arrive with every other field populated and no
  // ladder position - useless for deciding who is in the top 8, and they would
  // otherwise shadow the last real ladder when a later season falls back to
  // "where the previous season finished".
  const finalsRounds = new Set(
    fixtures.filter((f) => season.isFinalsFixture(f)).map((f) => f.round)
  );

  const eligible = done.filter((r) => !finalsRounds.has(r));

  const missing = eligible.filter((r) => !stored.includes(r));

  // A round whose stored snapshot was taken early, and which has since
  // finished. Without this the round stays on the provisional ladder for good:
  // the postponed game is eventually played, the round completes, and the
  // capture loop skips it because a snapshot already exists.
  const provisionalStored = await standings.getProvisionalRounds(year);
  const settled = eligible.filter(
    (r) => provisionalStored.includes(r) && !provisional.has(r)
  );

  let captured = 0;
  for (const round of missing) {
    // Sequential rather than parallel: Squiggle ask callers not to fire large
    // numbers of simultaneous requests.
    const n = await syncStandingsForRound(year, round, provisional.has(round));
    if (n) captured += 1;
  }

  let confirmed = 0;
  for (const round of settled) {
    const n = await syncStandingsForRound(year, round, false);
    if (n) confirmed += 1;
  }

  return {
    completed: done.length,
    captured,
    rounds: missing,
    provisional: [...provisional].filter((r) => missing.includes(r)),
    confirmed,
  };
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

// How far a payload may fall short of what is already stored before the
// shortfall is read as a bad answer rather than a real removal.
//
// The number is a judgement, not a measurement. Squiggle removing a game is
// rare and small - one or two: a cancelled match, or a finals fixture they
// have renumbered. Squiggle returning a fraction of the season is a feed
// problem, and acting on it would delete the fixtures the whole app is built
// on - no tipping, no scoring, no ladder. So anything that looks more like the
// second than the first is refused and left for a person to look at.
const PRUNE_FLOOR = 0.9;

// Fixtures Squiggle no longer serves.
//
// This sync had only ever added. Every game was upserted on Squiggle's id and
// nothing was ever removed, so a fixture Squiggle dropped or renumbered stayed
// in the collection for good. The unique index on id is what made the leftover
// hard to see: it stops the same game being stored twice, so the stale copy
// necessarily carries a different id, sits alongside the real one, and the
// round renders both. A Grand Final appeared twice on the production site that
// way, the stale card identifiable only by having no model prediction on it -
// predictions are matched on game id, and the id it was matched on was gone.
//
// Left alone it is worse than a repeated card. results.js decides a round is
// scorable with every(complete === 100), so a leftover stuck below 100 in a
// finished round means that round never scores and never takes its ladder
// snapshot. The one that surfaced landed in the finals, where tipping is shut
// anyway. In round 12 it would have quietly stalled the season.
//
// Deleting is the dangerous direction, so this runs only on a payload it has
// reason to trust - see PRUNE_FLOOR - and says exactly what it removed.
const pruneDepartedFixtures = async (year, live) => {
  const stored = await db.Fixture.countDocuments({ year });

  if (live.length < stored * PRUNE_FLOOR) {
    console.warn(
      `Squiggle returned ${live.length} games for ${year} against ${stored} ` +
        `stored, too far short to read as a removal. No fixtures were ` +
        `removed - if the season really has shrunk, prune it by hand.`
    );
    return 0;
  }

  const departed = await db.Fixture.find({ year, id: { $nin: live } })
    .select("id round roundname hteam ateam complete")
    .lean();

  if (!departed.length) return 0;

  await db.Fixture.deleteMany({ year, id: { $nin: live } });

  // Named, not counted. A deletion nobody can audit afterwards is worse than
  // the duplicate it fixed, and if this ever removes something it should not
  // have, this line is the only record of what it was.
  departed.forEach((fixture) => {
    console.warn(
      `Removed ${year} fixture ${fixture.id} - ` +
        `${fixture.roundname || `round ${fixture.round}`}, ` +
        `${fixture.hteam || "TBC"} v ${fixture.ateam || "TBC"}, ` +
        `complete ${fixture.complete}. Squiggle no longer serves it.`
    );
  });

  return departed.length;
};

const syncGames = async (year) => {
  const { games } = await squiggle.query("games", { year });
  if (!Array.isArray(games) || !games.length) {
    throw new Error(`Squiggle returned no games for ${year}`);
  }

  // Squiggle's id is the key every fixture is stored under, and a game without
  // one cannot be stored at all: updateOne({ id: undefined }) matches nothing,
  // so the upsert inserts a fresh fixture with no id - which then sits in the
  // collection as a duplicate of the game it was meant to be, exactly the
  // problem the prune below exists to clear up. It is also why that prune has
  // to stand down: the set of live ids is short by however many games arrived
  // anonymous, and every real fixture whose id went missing from the payload
  // looks departed.
  //
  // Squiggle has always sent an id. This is what happens on the day they do not.
  const identified = games.filter((game) => Number.isInteger(game.id));
  const anonymous = games.length - identified.length;

  if (anonymous) {
    console.warn(
      `Squiggle returned ${anonymous} ${year} game(s) with no id. They were ` +
        `not stored, and no fixtures were removed this run - a payload that ` +
        `cannot name its own games cannot say which are gone.`
    );
  }

  // Upsert by Squiggle's game id rather than deleting the season first, so a
  // failure part-way through cannot leave the season empty.
  await Promise.all(
    identified.map((game) => {
      // Squiggle's own `date` is pulled out before the spread rather than
      // written over afterwards.
      //
      // It is a bare local-time string with no zone on it. Spreading it and
      // then overwriting only when fixtureDate returned something meant that if
      // fixtureDate ever gave null - no unixtime and no tz - the raw string
      // went to Mongoose instead, and Mongoose casts it in whatever zone the
      // process happens to run in. Two hours out in Perth, ten on a UTC host,
      // so the kick-off this app locks tipping against would depend on where
      // the code was running. That is the exact bug fixtureDate exists to
      // prevent, still reachable through the fallback beside it.
      //
      // Squiggle sends unixtime today, so this has never fired. Removing the
      // path is cheaper than relying on that continuing.
      const { date: _squiggleLocalString, ...fields } = game;
      const date = fixtureDate(game);

      return db.Fixture.updateOne(
        { id: game.id },
        { $set: { ...fields, ...(date ? { date } : {}) } },
        { upsert: true }
      );
    })
  );

  // After the upserts, so a fixture being written and a fixture being removed
  // are never in flight together, and before forgetFixtures below, so the
  // cache is dropped once both halves are done rather than between them.
  const removed = anonymous
    ? 0
    : await pruneDepartedFixtures(
        year,
        identified.map((game) => game.id)
      );

  // The rest of this sync reads the season back - which rounds completed, which
  // need a ladder, what to score - and the season service holds the fixture
  // list for half a minute. Without this the sync would decide all of that from
  // the copy taken before it wrote anything.
  season.forgetFixtures(year);

  return { count: games.length, removed };
};

const syncSeason = async (year) => {
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid season: ${year}`);
  }

  const teamResult = await syncTeams();
  const gameResult = await syncGames(year);
  // Games first: which rounds are complete is read back from the fixtures we
  // have just stored.
  const ladders = await syncStandingsForCompletedRounds(year);
  // Then scoring, which needs the finished fixtures. Ordering matters: a round
  // is only scored once every game in it has been played, so the scores have to
  // be in before this runs.
  const scored = await results.calculateSeason(year);
  // Last, because it reads what scoring has just written. This is the
  // write-on-round-completion path for the cached global ladder. The read path
  // rebuilds on its own when the snapshot is behind, so a missed sync costs one
  // slow request rather than leaving a wrong ladder on the homepage.
  const globalStandings = await globalLadder.refresh(
    year,
    await globalLadder.currentThroughRound(year)
  );
  // Weekly leagues settle their pools off the same scored tips. Season-type
  // leagues have no per-round pool, so they are skipped.
  const weekly = await leagueRounds.scoreAllWeekly(year);

  return {
    year,
    teams: teamResult.count,
    missingLogos: teamResult.missingLogos,
    games: gameResult.count,
    // Fixtures Squiggle has stopped serving, deleted by this run. Normally 0.
    removedFixtures: gameResult.removed,
    ladders,
    scored,
    globalLadder: globalStandings.standings.length,
    weekly,
  };
};

// Which season a scheduled run should target when nobody named one.
//
// The calendar year is the right answer for most of the year, but not in
// January: the new season exists as a number long before the AFL releases the
// draw, and asking Squiggle for a season it has no games for is an error. A
// job running hourly would then fail every run for weeks, and a job that
// always fails is one whose failure nobody reads - which is the state you do
// not want it in when a real failure arrives.
//
// So fall back to the most recent season already stored, which is the one the
// app is showing anyway. Re-syncing it is harmless: the whole thing is
// idempotent. The changeover then happens on its own, the first run after
// Squiggle publishes the fixture.
const resolveSyncYear = async () => {
  const calendarYear = new Date().getFullYear();

  const { games } = await squiggle.query("games", { year: calendarYear });
  if (Array.isArray(games) && games.length) {
    return { year: calendarYear, fellBack: false };
  }

  const latest = await db.Fixture.findOne({}).sort({ year: -1 }).select("year");

  // Nothing stored either - a first run against an empty database. Return the
  // calendar year so the caller fails with the real reason rather than a
  // confusing fallback.
  if (!latest) return { year: calendarYear, fellBack: false };

  return { year: latest.year, fellBack: latest.year !== calendarYear };
};

module.exports = {
  syncSeason,
  syncTeams,
  syncGames,
  fixtureDate,
  syncStandingsForRound,
  syncStandingsForCompletedRounds,
  completedRounds,
  settledRounds,
  resolveSyncYear,
};

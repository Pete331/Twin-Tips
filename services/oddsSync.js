// Fetches prices and files them against fixtures.
//
// Shaped like services/seasonSync.js: it returns what it did rather than
// writing silently, so a scheduled caller can report a run and a dry run can
// print one without touching anything.
//
// The matching is the part that fails quietly if it is wrong, so it is pure and
// separately tested. Everything that talks to the database or the network sits
// below it.

const db = require("../models");
const oddsApi = require("./oddsApi");
const seasonService = require("./season");
const { resolveEventTeams } = require("./oddsTeams");
const { quotesFor, summariseSide } = require("./oddsMarket");

// How far apart a fixture and an odds event may be and still be the same game.
//
// The two sources will not agree to the minute, and a game can be moved after
// the odds were fetched. Three days is wide enough to absorb both and far
// narrower than the gap between two meetings of the same clubs, which is the
// only ambiguity that matters.
const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

// The fixture an odds event belongs to, or null.
//
// Matched on the pair of teams and the date, not on the provider's event id -
// that is theirs, and nothing else in the app knows it. Pure: takes the
// fixtures rather than querying for them.
const matchFixture = (event, fixtures, teams) => {
  const { home, away } = teams;
  if (home === null || away === null) return null;

  const commence = new Date(event.commence_time).getTime();

  const candidates = fixtures.filter((fixture) => {
    // Unordered, because the two sources need not agree on which side is
    // nominally at home. Which team gets which price is decided by team id
    // further down, so an orientation disagreement cannot mis-attribute
    // anything - it would only prevent a match.
    const pair =
      (fixture.hteamid === home && fixture.ateamid === away) ||
      (fixture.hteamid === away && fixture.ateamid === home);

    if (!pair) return false;
    if (!fixture.date) return false;

    return Math.abs(new Date(fixture.date).getTime() - commence) <= MATCH_WINDOW_MS;
  });

  // Two candidates means two meetings of the same clubs within three days,
  // which does not happen. Refusing rather than guessing keeps a scheduling
  // oddity from silently pricing the wrong game.
  if (candidates.length !== 1) return null;

  return candidates[0];
};

// The summary for one fixture, oriented to the fixture rather than to the feed.
//
// Prices are attached to team ids first and only then placed as home or away,
// so the orientation comes from one place - the fixture - and a feed that
// disagrees about which side is at home cannot swap a favourite's price onto
// the underdog.
const summariseForFixture = (event, fixture, teams) => {
  const { home: eventHomeId, away: eventAwayId } = teams;

  // Twice, deliberately. The figures are worked out from the bookmakers alone,
  // because they are bookmaker figures - but everything that priced the game is
  // written down, exchange included. The provider serves current prices only,
  // so a price not stored while it was live is gone: keeping the full set is
  // what makes "exclude Betfair" a decision that can be revisited rather than
  // one baked into history.
  const counted = quotesFor(event);
  const all = quotesFor(event, "h2h", { includeExcluded: true });

  const countedByTeam = new Map([
    [eventHomeId, counted.home],
    [eventAwayId, counted.away],
  ]);
  const allByTeam = new Map([
    [eventHomeId, all.home],
    [eventAwayId, all.away],
  ]);

  const side = (teamId) => ({
    ...summariseSide(countedByTeam.get(teamId) || []),
    quotes: allByTeam.get(teamId) || [],
  });

  return { home: side(fixture.hteamid), away: side(fixture.ateamid) };
};

// One event, worked out completely, with nothing written.
//
// Every outcome is named rather than being an absence, so a dry run can print
// what happened to each of nine games instead of listing the ones that worked.
const planEvent = (event, fixtures) => {
  const teams = resolveEventTeams(event.home_team, event.away_team);

  if (!teams.ok) {
    return {
      status: "unresolved",
      event,
      detail: `no team id for ${teams.unresolved.join(" and ")}`,
    };
  }

  const fixture = matchFixture(event, fixtures, teams);
  if (!fixture) {
    return {
      status: "unmatched",
      event,
      detail: `no fixture for ${event.home_team} v ${event.away_team} near ${event.commence_time}`,
    };
  }

  const sides = summariseForFixture(event, fixture, teams);

  if (!sides.home.count && !sides.away.count) {
    return {
      status: "unpriced",
      event,
      fixture,
      detail: "matched, but no bookmaker has priced it",
    };
  }

  return { status: "ready", event, fixture, sides, teams };
};

// Every event against every fixture of the season, still without writing.
const plan = (events, fixtures) => {
  const results = events.map((event) => planEvent(event, fixtures));

  return {
    events: events.length,
    ready: results.filter((r) => r.status === "ready"),
    unresolved: results.filter((r) => r.status === "unresolved"),
    unmatched: results.filter((r) => r.status === "unmatched"),
    unpriced: results.filter((r) => r.status === "unpriced"),
    results,
  };
};

// The document a ready plan becomes.
const toDocument = (entry, fetchedAt) => ({
  game: entry.fixture.id,
  year: entry.fixture.year,
  round: entry.fixture.round,
  homeTeamId: entry.fixture.hteamid,
  awayTeamId: entry.fixture.ateamid,
  home: entry.sides.home,
  away: entry.sides.away,
  fetchedAt,
  eventId: entry.event.id,
  commenceTime: entry.event.commence_time
    ? new Date(entry.event.commence_time)
    : null,
});

// Fetch, plan, and write unless told not to.
//
// apply defaults to false: nothing here writes by accident, and the scheduled
// caller passes it explicitly.
const syncOdds = async ({ apply = false, season } = {}) => {
  const year = Number.isInteger(season)
    ? season
    : (await seasonService.getSeasonState()).season;

  const { data: events, quota } = await oddsApi.odds();

  // Only the season's fixtures, and only the fields matching needs.
  const fixtures = await db.Fixture.find({ year })
    .select("id year round date hteamid ateamid hteam ateam")
    .lean();

  const planned = plan(events, fixtures);
  const fetchedAt = new Date();

  if (!apply) {
    return { year, quota, apply, written: 0, ...planned };
  }

  // Upserted on the fixture, so a re-poll of the same round corrects rather
  // than accumulating. A round polled fifteen times a day must leave fifteen
  // updates and nine rows.
  const writes = planned.ready.map((entry) => ({
    updateOne: {
      filter: { year: entry.fixture.year, game: entry.fixture.id },
      update: { $set: toDocument(entry, fetchedAt) },
      upsert: true,
    },
  }));

  if (writes.length) await db.Odds.bulkWrite(writes);

  return { year, quota, apply, written: writes.length, ...planned };
};

module.exports = {
  MATCH_WINDOW_MS,
  matchFixture,
  summariseForFixture,
  planEvent,
  plan,
  toDocument,
  syncOdds,
};

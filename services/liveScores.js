// Refreshing one round's scores from Squiggle, on demand, while it is being
// played.
//
// The scheduled sync runs hourly, which is fine for fixtures and ladders and
// far too slow for a score. A game that bounces at 6:10pm gets its first update
// at 7:00pm - measured on the Fremantle v Hawthorn final, which sat at no score
// for fifty minutes while it was actually being played.
//
// The obvious fix is to let the page ask Squiggle itself. It cannot: their
// terms forbid "a website that makes visitors fetch directly from the Squiggle
// API themselves", and they enforce it with an origin allowlist and a
// User-Agent a browser cannot set - see routes/squiggle.js.
//
// The next idea is to proxy that call per page load, which is allowed but is
// the same load wearing our User-Agent: ten people watching a game means ten
// calls a minute, and it scales with how many people are looking rather than
// with how often the score changes.
//
// So the refresh happens here instead, on the server, in front of the database
// that is already the source of truth. One call every couple of minutes however
// many people are watching, and the score on the page stays the score the tips
// are graded against.

const db = require("../models");
const squiggle = require("./squiggle");
const season = require("./season");
const { roundInProgress } = season;

// How stale a score may be before a request goes and gets a new one.
//
// Two minutes is roughly how often a scoreline moves in a game of football, so
// a shorter window would mostly re-fetch numbers that had not changed. It also
// caps Squiggle at 30 calls an hour while a game is on, whoever is watching -
// fewer than one visitor refreshing steadily would generate on their own.
const STALE_AFTER_MS = 2 * 60 * 1000;

// Long enough after the last bounce that anything still unfinished is a data
// problem rather than a game.
//
// Without it a fixture that never gets marked complete - a cancelled game, a
// bad feed - would read as "in progress" forever and every page load would
// refresh against it.
const roundIsLive = (fixtures, now) => roundInProgress(fixtures, now) !== null;

// Whether this request should pay for a refresh before it answers.
//
// Pure, and takes the clock and the rows rather than reading either, so the
// cases that matter - a live round with fresh data, a live round with stale
// data, a finished round - can be tested without a game being on.
const shouldRefresh = (fixtures, now, staleAfterMs = STALE_AFTER_MS) => {
  if (!fixtures || !fixtures.length) {
    return { refresh: false, reason: "no fixtures for that round" };
  }

  if (!roundIsLive(fixtures, now)) {
    return { refresh: false, reason: "no game in progress" };
  }

  // The oldest write in the round, so one fixture left behind still counts as
  // stale rather than being hidden by a sibling that updated.
  const written = fixtures
    .map((f) => f.updatedAt && new Date(f.updatedAt).getTime())
    .filter(Boolean);

  if (!written.length) {
    return { refresh: true, reason: "never written" };
  }

  const age = now.getTime() - Math.min(...written);
  if (age < staleAfterMs) {
    return {
      refresh: false,
      reason: `written ${Math.round(age / 1000)}s ago`,
      ageMs: age,
    };
  }

  return { refresh: true, reason: `written ${Math.round(age / 1000)}s ago`, ageMs: age };
};

// One round from Squiggle, written over the stored fixtures.
//
// Asks for the round rather than the season - the scheduled sync pulls all 200+
// games because it is also rebuilding ladders, and this only needs the nine
// being played.
//
// Only the fields that move during a game are written. A full upsert would also
// rewrite the venue, the date and the team ids on every refresh, which is a lot
// of churn for a scoreline and would let a mid-game feed hiccup move a fixture.
// A tighter budget than the sync's, because a person is waiting on this one.
// The whole point of the refresh is that the stored scores are already good
// enough - so a Squiggle that is thinking about it should cost a few stale
// minutes rather than the page itself.
const REQUEST_TIMEOUT_MS = 4000;

const refreshRound = async (year, round) => {
  const { games } = await squiggle.query(
    "games",
    { year, round },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  );

  if (!Array.isArray(games) || !games.length) {
    return { updated: 0, reason: "Squiggle returned no games" };
  }

  const writes = games
    .filter((g) => g && g.id !== undefined && g.id !== null)
    .map((game) => ({
      updateOne: {
        filter: { id: game.id },
        update: {
          $set: {
            hscore: game.hscore,
            ascore: game.ascore,
            hgoals: game.hgoals,
            hbehinds: game.hbehinds,
            agoals: game.agoals,
            abehinds: game.abehinds,
            complete: game.complete,
            winner: game.winner,
            // Where the game is up to - "Q4 14:44", or "Full Time".
            //
            // Written here as well as by the hourly sync, because this is the
            // refresh that runs while a game is actually on. A quarter-time
            // updated once an hour is worse than none: it would sit on the card
            // naming a quarter that finished forty minutes ago.
            timestr: game.timestr,
            // Stamped here rather than left to the schema.
            //
            // The reason this line used to give was wrong: it said a $set that
            // changes nothing leaves updatedAt alone, so a round whose score had
            // not moved would look permanently stale. Mongoose does not work
            // that way. It stamps updatedAt on every update it issues, through
            // Model.updateOne and through bulkWrite alike, whether or not a
            // single field actually changed - measured both ways.
            //
            // So this is redundant today, and kept deliberately. shouldRefresh
            // reads updatedAt to decide whether a round is worth asking Squiggle
            // about again, and that check only works while every write moves it.
            // Setting it here means the behaviour the check depends on is stated
            // where the write happens, rather than resting on a schema option
            // three files away that nobody would think to check before changing.
            updatedAt: new Date(),
          },
        },
      },
    }));

  if (!writes.length) return { updated: 0, reason: "nothing usable in response" };

  const result = await db.Fixture.bulkWrite(writes);

  // The season service holds the fixture list for half a minute, and the whole
  // point of this refresh is that a score has just moved. Without this the
  // request that triggered it would still be answered from the copy taken
  // before the write.
  season.forgetFixtures(year);

  return { updated: result.modifiedCount ?? writes.length };
};

// The one call a route makes. Returns what it did rather than throwing.
//
// A failure here must never cost the caller its fixtures: the stored round is
// still perfectly good, only older than it might have been, and a Squiggle
// outage should show slightly stale scores rather than an error page.
const refreshIfLive = async (year, round, now = new Date()) => {
  if (!Number.isInteger(year) || !Number.isInteger(round)) {
    return { refreshed: false, reason: "no round asked for" };
  }

  try {
    const fixtures = await db.Fixture.find({ year, round })
      .select("round date complete updatedAt")
      .lean();

    const decision = shouldRefresh(fixtures, now);
    if (!decision.refresh) return { refreshed: false, ...decision };

    const result = await refreshRound(year, round);
    return { refreshed: true, ...decision, ...result };
  } catch (err) {
    console.warn(`live score refresh failed for ${year} round ${round}: ${err.message}`);
    return { refreshed: false, reason: `failed: ${err.message}` };
  }
};

module.exports = {
  STALE_AFTER_MS,
  shouldRefresh,
  refreshRound,
  refreshIfLive,
};

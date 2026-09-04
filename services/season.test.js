const test = require("node:test");
const assert = require("node:assert");

const { firstFixtureDate } = require("./season");

const at = (iso) => ({ date: new Date(iso) });

test("returns the earliest kick-off in the round", () => {
  const round = [
    at("2026-03-20T08:30:00Z"),
    at("2026-03-19T08:40:00Z"),
    at("2026-03-21T03:15:00Z"),
  ];

  assert.equal(
    firstFixtureDate(round).toISOString(),
    "2026-03-19T08:40:00.000Z"
  );
});

// The caller passes fixtures sorted by date, but that is the caller's doing.
// Taking [0] would make this quietly wrong the day anything reorders them.
test("does not assume the list arrives sorted", () => {
  const ascending = [at("2026-03-19T08:40:00Z"), at("2026-03-20T08:30:00Z")];
  const descending = [...ascending].reverse();

  assert.deepEqual(firstFixtureDate(ascending), firstFixtureDate(descending));
});

test("ignores fixtures with no date rather than returning one", () => {
  const round = [
    { date: null },
    at("2026-03-20T08:30:00Z"),
    { date: undefined },
  ];

  assert.equal(
    firstFixtureDate(round).toISOString(),
    "2026-03-20T08:30:00.000Z"
  );
});

// Finals fixtures exist before anyone knows who is in them, and can carry no
// date at all. There is nothing to count down to, and null says so - a caller
// that got an epoch-zero Date instead would render a countdown that expired in
// 1970.
test("returns null when nothing in the round has a date", () => {
  assert.equal(firstFixtureDate([{ date: null }, {}]), null);
  assert.equal(firstFixtureDate([]), null);
});

test("handles a single fixture", () => {
  assert.equal(
    firstFixtureDate([at("2026-09-26T05:30:00Z")]).toISOString(),
    "2026-09-26T05:30:00.000Z"
  );
});

// --- roundInProgress -------------------------------------------------------
//
// The bug these cover: the app used to decide what round it was from the next
// unplayed fixture, which moves the moment the last game of a round bounces.
// For the length of that final game it named the round after, and opened
// tipping for it - against a ladder snapshot that does not exist until the
// round is complete, so getLadderForRound fell back a further round.

const { roundInProgress } = require("./season");

const game = (round, iso, complete) => ({
  round,
  date: new Date(iso),
  complete,
});

// Round 12 finishes Sunday 16:40, round 13 starts the following Thursday.
const R12 = [
  game(12, "2026-06-04T09:20:00Z", 100),
  game(12, "2026-06-06T06:40:00Z", 100),
];
const R13 = [game(13, "2026-06-11T09:20:00Z", 0)];

test("names the round being played, not the one after it", () => {
  // The last game of round 12 has bounced but is not finished. This is the
  // window the whole change is about.
  const fixtures = [
    R12[0],
    game(12, "2026-06-06T06:40:00Z", 45),
    ...R13,
  ];

  assert.equal(
    roundInProgress(fixtures, new Date("2026-06-06T07:30:00Z")),
    12
  );
});

test("moves on once the last game is actually finished", () => {
  assert.equal(
    roundInProgress([...R12, ...R13], new Date("2026-06-06T09:00:00Z")),
    null
  );
});

test("a round that has not started yet is not in progress", () => {
  assert.equal(
    roundInProgress([...R12, ...R13], new Date("2026-06-08T00:00:00Z")),
    null
  );
});

test("holds the round from its first bounce, not just its last", () => {
  const fixtures = [
    game(12, "2026-06-04T09:20:00Z", 60),
    game(12, "2026-06-06T06:40:00Z", 0),
  ];

  assert.equal(
    roundInProgress(fixtures, new Date("2026-06-04T10:00:00Z")),
    12
  );
});

// A game does not last a day. A round still reading as unfinished this long
// after its last bounce means the sync has stopped, and holding tipping shut
// all week on stale data is the worse failure of the two.
test("gives up on a round left unfinished for more than a day", () => {
  const fixtures = [game(12, "2026-06-06T06:40:00Z", 45), ...R13];

  assert.equal(
    roundInProgress(fixtures, new Date("2026-06-07T04:00:00Z")),
    12,
    "still within the day"
  );
  assert.equal(
    roundInProgress(fixtures, new Date("2026-06-08T00:00:00Z")),
    null,
    "past it - treat as stale rather than still playing"
  );
});

test("returns the earliest unfinished round when two are open", () => {
  const fixtures = [
    game(11, "2026-05-30T06:40:00Z", 80),
    game(12, "2026-06-04T09:20:00Z", 0),
  ];

  assert.equal(
    roundInProgress(fixtures, new Date("2026-05-30T07:30:00Z")),
    11
  );
});

test("no fixtures, no round in progress", () => {
  assert.equal(roundInProgress([], new Date("2026-06-06T07:30:00Z")), null);
});

// --- the fixture cache ---------------------------------------------------
//
// getSeasonState caches the fixture list for half a minute because it runs on
// every page load. What must never be cached is anything derived from it: if
// the lockout decision were held for thirty seconds, a round would read as open
// for thirty seconds after the first bounce, and the one rule this app cannot
// get wrong would be wrong by exactly that much.

const seasonService = require("./season");

test("the cache holds fixtures, not the decisions made from them", async () => {
  // Two fixtures a minute apart, so the same data gives a different answer
  // depending only on the clock.
  const bounce = new Date("2026-05-01T09:00:00Z");
  const fixtures = [
    { round: 1, date: new Date("2026-04-24T09:00:00Z"), complete: 100, is_final: 0, roundname: "Round 1" },
    { round: 2, date: bounce, complete: 0, is_final: 0, roundname: "Round 2" },
    { round: 2, date: new Date("2026-05-03T09:00:00Z"), complete: 0, is_final: 0, roundname: "Round 2" },
  ];

  // roundInProgress is the pure half the cached list feeds, and it takes `now`
  // rather than reading a clock - which is what makes the caching safe.
  const before = new Date(bounce.getTime() - 60 * 1000);
  const after = new Date(bounce.getTime() + 60 * 1000);

  assert.equal(seasonService.roundInProgress(fixtures, before), null);
  assert.equal(seasonService.roundInProgress(fixtures, after), 2);
});

test("the cache can be dropped for one season without touching the others", () => {
  // Nothing to assert about contents from out here - the point is that the
  // writers have something to call, and that calling it is safe with no cache
  // present and with no season named.
  assert.doesNotThrow(() => seasonService.forgetFixtures(2026));
  assert.doesNotThrow(() => seasonService.forgetFixtures());
  assert.doesNotThrow(() => seasonService.forgetFixtures(1999));
});

test("the cache window is short enough to be invisible between refreshes", () => {
  assert.ok(seasonService.FIXTURE_CACHE_MS <= 60 * 1000);
  assert.ok(seasonService.FIXTURE_CACHE_MS > 0);
});

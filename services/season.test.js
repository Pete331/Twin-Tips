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

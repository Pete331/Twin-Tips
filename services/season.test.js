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

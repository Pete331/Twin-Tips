const test = require("node:test");
const assert = require("node:assert");

const { shouldRefresh, STALE_AFTER_MS } = require("./liveScores");

const NOW = new Date("2026-09-03T10:30:00Z");
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60 * 1000);

// A round of two, one bounced and one to come - a Thursday night final, which
// is the case this exists for.
const live = (over = {}) => [
  {
    round: 26,
    date: minutesAgo(40),
    complete: 45,
    updatedAt: minutesAgo(1),
    ...over,
  },
  {
    round: 26,
    date: new Date(NOW.getTime() + 26 * 60 * 60 * 1000),
    complete: 0,
    updatedAt: minutesAgo(1),
    ...over,
  },
];

test("a game in progress with a fresh score is left alone", () => {
  const decision = shouldRefresh(live(), NOW);
  assert.equal(decision.refresh, false);
  assert.match(decision.reason, /ago/);
});

// The whole point: a scoreline older than the window costs one call.
test("a game in progress with a stale score is refreshed", () => {
  const decision = shouldRefresh(live({ updatedAt: minutesAgo(5) }), NOW);
  assert.equal(decision.refresh, true);
});

test("the window is two minutes either side", () => {
  const just = shouldRefresh(live({ updatedAt: minutesAgo(1.9) }), NOW);
  const past = shouldRefresh(live({ updatedAt: minutesAgo(2.1) }), NOW);
  assert.equal(just.refresh, false);
  assert.equal(past.refresh, true);
  assert.equal(STALE_AFTER_MS, 120000);
});

// Nobody is watching a round that finished last month, and refreshing it would
// spend a call to learn nothing.
test("a finished round is never refreshed, however old the write", () => {
  const done = [
    { round: 24, date: minutesAgo(60 * 24 * 7), complete: 100, updatedAt: minutesAgo(60 * 24) },
    { round: 24, date: minutesAgo(60 * 24 * 7), complete: 100, updatedAt: minutesAgo(60 * 24) },
  ];
  assert.equal(shouldRefresh(done, NOW).refresh, false);
});

// Looking at next week's fixtures should not wake the API either.
test("a round that has not started is not refreshed", () => {
  const upcoming = [
    { round: 27, date: new Date(NOW.getTime() + 3 * 86400000), complete: 0, updatedAt: minutesAgo(600) },
  ];
  assert.equal(shouldRefresh(upcoming, NOW).refresh, false);
});

test("a round with no fixtures asks for nothing", () => {
  assert.equal(shouldRefresh([], NOW).refresh, false);
  assert.equal(shouldRefresh(undefined, NOW).refresh, false);
});

// The oldest write in the round decides, so one fixture left behind by a
// partial write still counts as stale rather than being covered for by a
// sibling that happened to update.
test("the stalest fixture in the round is the one that counts", () => {
  const mixed = [
    { round: 26, date: minutesAgo(40), complete: 45, updatedAt: minutesAgo(1) },
    { round: 26, date: minutesAgo(40), complete: 20, updatedAt: minutesAgo(9) },
  ];
  assert.equal(shouldRefresh(mixed, NOW).refresh, true);
});

test("a fixture that has never been written is refreshed", () => {
  const fresh = [{ round: 26, date: minutesAgo(40), complete: 0, updatedAt: null }];
  const decision = shouldRefresh(fresh, NOW);
  assert.equal(decision.refresh, true);
  assert.match(decision.reason, /never written/);
});

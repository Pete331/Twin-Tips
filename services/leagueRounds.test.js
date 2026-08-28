const test = require("node:test");
const assert = require("node:assert/strict");

const { poolShare } = require("./leagueRounds");

// The pool is buyIn x submissions, and the share is what one winner takes -
// held in buy-in units so the buy-in multiplies in at display rather than
// being baked into stored history.
test("one winner takes the whole pool", () => {
  assert.equal(poolShare(8, 1), 8);
});

test("the pool splits evenly between winners", () => {
  assert.equal(poolShare(8, 2), 4);
  assert.equal(poolShare(9, 3), 3);
});

// 50 points across three winners is 16.666..., and this is the case the spec
// singles out. Stored as an exact third, so the buy-in multiplies in later and
// three shares still add back to the pool.
test("a pool that does not divide cleanly keeps its precision", () => {
  const share = poolShare(10, 3);
  assert.equal(share * 3, 10);
  assert.equal(share > 3.33 && share < 3.34, true);

  // Where the buy-in is 5, that is 50 points across three: 16.67 each, and
  // the three still come back to 50 rather than 50.01.
  assert.equal(Math.round(share * 5 * 100) / 100, 16.67);
  assert.equal(share * 5 * 3, 50);
});

// Rounding a third up to 0.34 three times invents points nobody paid in, and
// over a season the supply drifts upward.
test("a share is never rounded up", () => {
  const share = poolShare(10, 3);
  assert.equal(share <= 10 / 3, true);
});

// Non-submitters put nothing in, so the pool sizes to who actually tipped -
// not to how many people are in the league.
test("the pool counts entrants, not members", () => {
  // Ten in the league, four tipped.
  assert.equal(poolShare(4, 1), 4);
});

test("a round nobody won pays nothing out", () => {
  assert.equal(poolShare(8, 0), 0);
});

test("a round nobody entered has no pool", () => {
  assert.equal(poolShare(0, 0), 0);
  assert.equal(poolShare(0, 1), 0);
});

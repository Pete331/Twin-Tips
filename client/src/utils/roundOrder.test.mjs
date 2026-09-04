import test from "node:test";
import assert from "node:assert";

import { byResult, marginError } from "./roundOrder.js";

const row = (username, correctTips, over) => ({
  username,
  correctTips,
  ...over,
});

const order = (rows) => [...rows].sort(byResult).map((r) => r.username);

test("more correct tips comes first", () => {
  const rows = [row("a", 1), row("b", 2), row("c", 0)];
  assert.deepEqual(order(rows), ["b", "a", "c"]);
});

// The case from round 24: everyone tipped one, and the margin decided it.
test("level on tips, the closest margin wins", () => {
  const rows = [
    row("testt", 1, { bottomTenDifference: 56 }),
    row("seeds", 1, { topEightDifference: 46 }),
    row("demod", 1, { bottomTenDifference: 21 }),
    row("samples", 1, { bottomTenDifference: 7 }),
    row("dummyd", 1, { bottomTenDifference: 46 }),
    row("Pete_331", 1, { bottomTenDifference: 64 }),
  ];
  assert.deepEqual(order(rows), [
    "samples",
    "demod",
    "seeds",
    "dummyd",
    "testt",
    "Pete_331",
  ]);
});

// The whole reason marginError does not use `||`: nailing the margin exactly is
// the best possible result, and a falsy check would read it as no margin at all
// and sort it last.
test("a margin of exactly 0 is the best margin, not a missing one", () => {
  const rows = [row("a", 1, { topEightDifference: 3 }), row("b", 1, { topEightDifference: 0 })];
  assert.deepEqual(order(rows), ["b", "a"]);
  assert.equal(marginError(rows[1]), 0);
});

test("tips beat margin - a better margin does not overtake a better score", () => {
  const rows = [
    row("close", 1, { topEightDifference: 1 }),
    row("correct", 2, { topEightDifference: 90 }),
  ];
  assert.deepEqual(order(rows), ["correct", "close"]);
});

// A round in progress: nothing is scored, so nothing should be reordered.
test("unscored rows keep the order they arrived in", () => {
  const rows = [row("c"), row("a"), row("b")];
  assert.deepEqual(order(rows), ["c", "a", "b"]);
});

test("an unscored row sorts below a scored one", () => {
  const rows = [row("unscored"), row("scored", 0, { topEightDifference: 40 })];
  assert.deepEqual(order(rows), ["scored", "unscored"]);
});

// Level on tips, but one of them never nominated a margin. The one who did is
// ranked; the one who did not cannot be, so they go after.
test("a row with no margin sorts below one that has a margin", () => {
  const rows = [row("none", 1), row("some", 1, { bottomTenDifference: 99 })];
  assert.deepEqual(order(rows), ["some", "none"]);
});

test("topEight is the margin that counts when both are set", () => {
  assert.equal(
    marginError({ topEightDifference: 4, bottomTenDifference: 60 }),
    4
  );
});

test("no margin at all reads as null rather than 0", () => {
  assert.equal(marginError({}), null);
  assert.equal(marginError({ topEightDifference: null }), null);
});

import test from "node:test";
import assert from "node:assert";

import { defaultTipsRound } from "./rounds.js";

// The six states the season moves through, as the season service reports them.
// currentRound is the round the AFL calendar is on; lastCompletedRound is the
// most recent round where every game finished.
const state = (over) => ({
  tippingOpen: false,
  roundStarted: false,
  currentRound: 13,
  lastCompletedRound: 12,
  ...over,
});

test("mid-week with tipping open, the round you came to tip", () => {
  assert.equal(
    defaultTipsRound(state({ tippingOpen: true })),
    13
  );
});

// The change this was written for. A game is on, and the page used to sit on
// last week's results while it played.
test("a round in progress opens on that round", () => {
  assert.equal(
    defaultTipsRound(state({ tippingOpen: false, roundStarted: true })),
    13
  );
});

// The gap between a round finishing and its ladder snapshot being written.
// currentRound has already rolled forward, so it points at fixtures with no
// scores - the round just played is what someone wants.
test("after a round, while the ladder catches up, the round just played", () => {
  assert.equal(
    defaultTipsRound(
      state({ tippingOpen: false, roundStarted: false, currentRound: 14, lastCompletedRound: 13 })
    ),
    13
  );
});

// The case that rules lockout out as the test. Lockout is true for the whole of
// September, so a rule keyed on it would open on next week's final here - a
// round with no scores in it yet.
test("between finals weeks, the final just played, not the one to come", () => {
  const betweenFinals = state({
    tippingOpen: false,
    roundStarted: false,
    isFinals: true,
    lockout: true,
    currentRound: 26,
    lastCompletedRound: 25,
  });
  assert.equal(defaultTipsRound(betweenFinals), 25);
});

test("a finals week in progress opens on that final", () => {
  const finalOn = state({
    tippingOpen: false,
    roundStarted: true,
    isFinals: true,
    lockout: true,
    currentRound: 26,
    lastCompletedRound: 25,
  });
  assert.equal(defaultTipsRound(finalOn), 26);
});

// The grand final has been played, so it is both the current round and the last
// completed one. Either answer is the same; this pins that it does not go
// looking further back.
test("a finished season opens on the last round played", () => {
  const done = state({
    tippingOpen: false,
    roundStarted: true,
    seasonComplete: true,
    lockout: true,
    currentRound: 28,
    lastCompletedRound: 28,
  });
  assert.equal(defaultTipsRound(done), 28);
});

// Round one of a season: nothing has been completed to fall back to.
test("with no completed round, falls back to the current one", () => {
  assert.equal(
    defaultTipsRound(state({ currentRound: 0, lastCompletedRound: null })),
    0
  );
  assert.equal(
    defaultTipsRound(state({ currentRound: 1, lastCompletedRound: undefined })),
    1
  );
});

// Round 0 is a real round - the Opening Round - so it has to survive a falsy
// check somewhere in the chain.
test("round 0 is a round, not an absence", () => {
  assert.equal(
    defaultTipsRound(state({ roundStarted: true, currentRound: 0 })),
    0
  );
  assert.equal(
    defaultTipsRound(state({ currentRound: 1, lastCompletedRound: 0 })),
    0
  );
});

test("no season state yet asks for no round", () => {
  assert.equal(defaultTipsRound(undefined), undefined);
  assert.equal(defaultTipsRound(null), undefined);
});

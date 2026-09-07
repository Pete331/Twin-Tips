import test from "node:test";
import assert from "node:assert";

import { defaultTipsRound, tipsButtonLabel } from "./rounds.js";

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

// --- tipsButtonLabel -----------------------------------------------------
//
// The button on the home page. Its job is to say what you can do and which
// round you will land on, and the round has to be the one the tips page will
// actually open on - the two used to be worked out separately.
//
// The wording it replaced said "View round 26 results" during the finals. Two
// things wrong with that: "results" is the round results table on the home page
// itself, not what the tips page shows, and round 26 is Finals Week 1 to
// everybody who follows the football.

const NAMES = {
  0: "Opening Round",
  12: "Round 12",
  13: "Round 13",
  24: "Round 24",
  26: "Finals Week 1",
  27: "Semi-Finals",
};

const season = (over) => ({
  tippingOpen: false,
  roundStarted: false,
  lockout: true,
  isFinals: false,
  homeAndAwayComplete: false,
  seasonComplete: false,
  currentRound: 13,
  lastCompletedRound: 12,
  roundNames: NAMES,
  ...over,
});

test("tipping open with nothing saved invites you to enter", () => {
  assert.equal(
    tipsButtonLabel(season({ tippingOpen: true, lockout: false })),
    "Enter Round 13 tips"
  );
});

test("tipping open with tips saved offers to edit them", () => {
  assert.equal(
    tipsButtonLabel(season({ tippingOpen: true, lockout: false }), {
      hasSelections: true,
    }),
    "Edit Round 13 tips"
  );
});

// Once the first game has bounced the tips are locked, so the only thing left
// to do is look at them.
test("a round under way is a view of the tips", () => {
  assert.equal(
    tipsButtonLabel(season({ roundStarted: true, lockout: true })),
    "View Round 13 tips"
  );
});

// The case this was rebuilt for. A finals round has no tips and never will, so
// the button cannot offer any - and it names the final rather than its number.
test("during the finals it offers scores, named as a finals week", () => {
  assert.equal(
    tipsButtonLabel(
      season({
        isFinals: true,
        homeAndAwayComplete: true,
        currentRound: 27,
        lastCompletedRound: 26,
      })
    ),
    "View Finals Week 1 scores"
  );
});

// The divergence that prompted this. With a final actually being played the
// button named the week before while the page opened on the one in progress.
test("a final in progress names the final in progress", () => {
  const state = season({
    isFinals: true,
    homeAndAwayComplete: true,
    roundStarted: true,
    currentRound: 27,
    lastCompletedRound: 26,
  });

  assert.equal(tipsButtonLabel(state), "View Semi-Finals scores");
  assert.equal(
    defaultTipsRound(state),
    27,
    "and that is the round the page opens on"
  );
});

// Every state, checked against the page it leads to. This is the whole point of
// the function: one answer, not two that have to be kept in step.
test("the round named is always the round the page opens on", () => {
  const states = [
    season({ tippingOpen: true, lockout: false }),
    season({ roundStarted: true }),
    season({ isFinals: true, homeAndAwayComplete: true, currentRound: 27, lastCompletedRound: 26 }),
    season({ homeAndAwayComplete: true, currentRound: 25, lastCompletedRound: 24 }),
    season({ seasonComplete: true, currentRound: 29, lastCompletedRound: 29, roundNames: { 29: "Grand Final" } }),
  ];

  for (const state of states) {
    const round = defaultTipsRound(state);
    const name = NAMES[round] || (state.roundNames && state.roundNames[round]);
    assert.ok(
      tipsButtonLabel(state).includes(name),
      `"${tipsButtonLabel(state)}" should name round ${round} (${name})`
    );
  }
});

// The home-and-away season is over but the finals have not started. Twin Tips
// is finished for the year either way, so there are no tips to offer.
test("between the last round and the finals it still offers scores", () => {
  assert.equal(
    tipsButtonLabel(
      season({ homeAndAwayComplete: true, currentRound: 25, lastCompletedRound: 24 })
    ),
    "View Round 24 scores"
  );
});

test("round 0 is named, not treated as nothing", () => {
  assert.equal(
    tipsButtonLabel(
      season({
        tippingOpen: true,
        lockout: false,
        currentRound: 0,
        lastCompletedRound: null,
      })
    ),
    "Enter Opening Round tips"
  );
});

// A season with no fixtures has no round to name, and "Round null" is worse
// than saying nothing about it.
test("no round to name still gives the button something to say", () => {
  assert.equal(tipsButtonLabel(undefined), "Go to tips");
  assert.equal(tipsButtonLabel(null), "Go to tips");
  assert.equal(
    tipsButtonLabel(season({ currentRound: null, lastCompletedRound: null })),
    "Go to tips"
  );
});

// Older seasons were stored before round names were kept.
test("without stored names it falls back to numbering", () => {
  assert.equal(
    tipsButtonLabel(
      season({ tippingOpen: true, lockout: false, roundNames: undefined })
    ),
    "Enter Round 13 tips"
  );
});

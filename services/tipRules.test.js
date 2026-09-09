const test = require("node:test");
const assert = require("node:assert/strict");

const { validateSelections } = require("./tipRules");

// Three games, each pairing a top-8 side with a bottom-10 one - which is the
// usual shape and the reason a legal tip has to come from two different games.
const fixtures = [
  { hteam: "Geelong", hteamid: 1, ateam: "Essendon", ateamid: 2 },
  { hteam: "Sydney", hteamid: 3, ateam: "North Melbourne", ateamid: 4 },
  { hteam: "Hawthorn", hteamid: 5, ateam: "West Coast", ateamid: 6 },
];

const ladder = new Map([
  [1, { rank: 2 }], // Geelong
  [2, { rank: 14 }], // Essendon
  [3, { rank: 5 }], // Sydney
  [4, { rank: 17 }], // North Melbourne
  [5, { rank: 3 }], // Hawthorn
  [6, { rank: 18 }], // West Coast
]);

// Geelong from game one, North Melbourne from game two: different games,
// right groups, no repeat.
const check = (over = {}) =>
  validateSelections({
    topEightSelection: "Geelong",
    bottomTenSelection: "North Melbourne",
    fixtures,
    ladder,
    previousTip: null,
    ...over,
  });

test("a legal tip passes", () => {
  assert.equal(check(), null);
});

test("the two selections must differ", () => {
  assert.match(
    check({ topEightSelection: "Geelong", bottomTenSelection: "Geelong" }),
    /two different teams/
  );
});

test("a team that is not playing this round is refused", () => {
  assert.match(check({ topEightSelection: "Carlton" }), /Carlton is not playing/);
  assert.match(check({ bottomTenSelection: "Carlton" }), /Carlton is not playing/);
});

// One of the two is certain to lose, so it is not a tip. The tips page clears
// both selections when it notices; the server has to refuse it outright.
test("both sides of the same game are refused", () => {
  assert.match(
    check({ topEightSelection: "Geelong", bottomTenSelection: "Essendon" }),
    /playing each other/
  );
  assert.match(
    check({ topEightSelection: "Sydney", bottomTenSelection: "North Melbourne" }),
    /playing each other/
  );
});

test("the top-8 pick must actually be in the top 8", () => {
  assert.match(
    check({ topEightSelection: "Essendon", bottomTenSelection: "West Coast" }),
    /Essendon is not in the top 8/
  );
});

test("the bottom-10 pick must actually be in the bottom 10", () => {
  assert.match(
    check({ topEightSelection: "Geelong", bottomTenSelection: "Hawthorn" }),
    /Hawthorn is not in the bottom 10/
  );
});

// Rank 8 is the last of the top 8 and rank 9 the first of the bottom 10. Off
// by one here puts a team in the wrong half of the ladder.
test("rank 8 is top 8 and rank 9 is bottom 10", () => {
  const boundaryFixtures = [
    { hteam: "Eighth", hteamid: 1, ateam: "Twelfth", ateamid: 2 },
    { hteam: "Ninth", hteamid: 3, ateam: "First", ateamid: 4 },
  ];
  const boundaryLadder = new Map([
    [1, { rank: 8 }],
    [2, { rank: 12 }],
    [3, { rank: 9 }],
    [4, { rank: 1 }],
  ]);

  const boundary = (top, bottom) =>
    validateSelections({
      topEightSelection: top,
      bottomTenSelection: bottom,
      fixtures: boundaryFixtures,
      ladder: boundaryLadder,
      previousTip: null,
    });

  assert.equal(boundary("Eighth", "Ninth"), null);
  assert.match(boundary("Ninth", "Twelfth"), /Ninth is not in the top 8/);
  assert.match(boundary("First", "Eighth"), /Eighth is not in the bottom 10/);
});

// Refusing beats storing something that cannot be verified. The tips page
// treats the same round as untippable, for the same reason.
test("no ladder means the tip cannot be checked, so it is refused", () => {
  assert.match(
    check({ ladder: new Map() }),
    /ladder for this round is unavailable/
  );
  assert.match(
    check({
      ladder: new Map([
        [1, { rank: null }],
        [4, { rank: 17 }],
      ]),
    }),
    /ladder for this round is unavailable/
  );
});

test("last round's picks cannot be repeated", () => {
  assert.match(
    check({
      previousTip: {
        topEightSelection: "Geelong",
        bottomTenSelection: "Richmond",
      },
    }),
    /You picked Geelong last round/
  );
});

// The rule is "the same team in consecutive rounds". It does not care which
// group the team was picked in last time.
test("a repeat counts across groups", () => {
  assert.match(
    check({
      previousTip: {
        topEightSelection: "Sydney",
        bottomTenSelection: "Geelong",
      },
    }),
    /You picked Geelong last round/
  );
});

test("no previous tip is not a repeat", () => {
  assert.equal(check({ previousTip: null }), null);
  assert.equal(check({ previousTip: undefined }), null);
});

test("an unrelated previous tip blocks nothing", () => {
  assert.equal(
    check({
      previousTip: {
        topEightSelection: "Hawthorn",
        bottomTenSelection: "West Coast",
      },
    }),
    null
  );
});

// A missing selection names itself rather than reaching the fixture lookup and
// reporting "null is not playing this round". The route refuses an empty
// selection before this is called, so the old message was unreachable - these
// rules are still meant to hold on their own.
test("a missing selection is refused by name, not by lookup", () => {
  const args = { fixtures: [], ladder: new Map(), previousTip: null };

  for (const [top, bottom] of [
    [null, "Essendon"],
    ["Adelaide", null],
    [undefined, undefined],
    ["", ""],
  ]) {
    const message = validateSelections({
      ...args,
      topEightSelection: top,
      bottomTenSelection: bottom,
    });
    assert.match(message, /Pick a team from the top 8/);
    assert.doesNotMatch(message, /null|undefined/);
  }
});

// When a round's tips stop being private.
//
// The rule the browser has always applied and the server never did: the
// dashboard declines to draw the cells, and the routes behind it hand over
// every selection regardless. That is the same shape the tipping deadline had
// before it moved to the server, and the same worthless kind of rule.
//
// It matters more here than in an ordinary tipping competition. A legal tip is
// one team from the top eight and one from the bottom ten, from two different
// games, and neither may repeat last round's pick - so there are few enough
// legal tips that reading a handful of people's is close to reading everyone's.

const { selectionsVisible } = require("./tipRules");

// Only the two fields the rule reads.
const state = (currentRound, lockout) => ({ currentRound, lockout });

test("a round already played is public", () => {
  assert.equal(selectionsVisible(state(12, false), 11), true);
  assert.equal(selectionsVisible(state(12, false), 0), true, "round 0 is a round");
});

// The whole point of a deadline. Everyone's picks appear at once, at the first
// bounce, and not one second before it.
test("the round being tipped opens at the bounce and not before", () => {
  assert.equal(selectionsVisible(state(12, false), 12), false);
  assert.equal(selectionsVisible(state(12, true), 12), true);
});

// Somebody getting in early. Nobody else's business, and nothing on any page
// asks for it - which is exactly why it would go unnoticed.
test("a round nobody has tipped yet is not shown at all", () => {
  assert.equal(selectionsVisible(state(12, true), 13), false);
  assert.equal(selectionsVisible(state(12, false), 99), false);
});

// No fixtures at all, which is the off-season. The season service reports
// lockout true there for the same reason: nothing is in progress to protect.
test("with no round in progress it follows the lockout", () => {
  assert.equal(selectionsVisible(state(null, true), 5), true);
  assert.equal(selectionsVisible(state(null, false), 5), false);
  assert.equal(selectionsVisible(state(undefined, true), 5), true);
});

// Refusing is the safe direction: a missing state shows nothing rather than
// everything.
test("nothing to go on shows nothing", () => {
  assert.equal(selectionsVisible(null, 5), false);
  assert.equal(selectionsVisible(undefined, 5), false);
  assert.equal(selectionsVisible(state(12, true), null), false);
  assert.equal(selectionsVisible(state(12, true), undefined), false);
});

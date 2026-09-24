// Where somebody who has not tipped belongs on a ladder.
//
// marginError is a distance from the real margin, so lower is better, and
// somebody who never entered has run up none of it. A flawless zero, achieved
// by not turning up. The season sort reads correct tips first and margin error
// second, so among everyone level on correct tips the non-entrants came out on
// top of the players - a member who tipped every round and had a bad year sat
// below an account that has never submitted anything.
//
// Two answers, because there are two tables and they are not the same table.
//
// A league lists its members whether they have played or not. Membership is
// something you opted into and the roll-call is half of what the table is for,
// so they stay - they just stop outranking people. The site ladder's
// population is every registered account, so nobody is "in" it and a signup
// that never entered a round is not a participant on nothing. Those are left
// out, and counted instead.

const test = require("node:test");
const assert = require("node:assert/strict");

const { rankSeason, hasEntered } = require("./leagueStandings");

// A row as tallySeason builds it.
const row = (username, correctTips, marginError, roundsTipped) => ({
  user: username,
  username,
  correctTips,
  marginError,
  roundsTipped,
});

const order = (entries) => rankSeason(entries).map((e) => e.username);

test("a non-entrant ranks below a player level with them", () => {
  // Both on nothing. Ann tipped all season and got none of them right, which
  // is a bad season; Zed has never submitted a tip, which is not a season at
  // all. Before this, Zed's untouched margin of zero put them first.
  const ranked = rankSeason([row("zed", 0, 0, 0), row("ann", 0, 180, 12)]);

  assert.deepEqual(
    ranked.map((e) => e.username),
    ["ann", "zed"]
  );
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 2);
});

test("and below every player, however badly they did", () => {
  assert.deepEqual(
    order([
      row("zed", 0, 0, 0),
      row("yan", 0, 0, 0),
      row("ann", 0, 400, 20),
      row("bob", 1, 300, 20),
    ]),
    ["bob", "ann", "yan", "zed"]
  );
});

// The demotion is not allowed to reach into the part of the table that is
// actually a contest.
test("it does not disturb the order among players", () => {
  assert.deepEqual(
    order([
      row("cat", 8, 120, 12),
      row("ann", 10, 200, 12),
      row("bob", 10, 90, 12),
      row("zed", 0, 0, 0),
    ]),
    ["bob", "ann", "cat", "zed"]
  );
});

test("non-entrants are level with each other, not ordered by nothing", () => {
  const ranked = rankSeason([
    row("ann", 5, 100, 10),
    row("yan", 0, 0, 0),
    row("zed", 0, 0, 0),
  ]);

  const [, second, third] = ranked;
  assert.equal(second.rank, 2);
  assert.equal(
    third.rank,
    2,
    "two people who have not played are not 2nd and 3rd"
  );
  assert.equal(third.tied, true);
});

// The case the tie marker gets wrong if entry status is left out of the
// comparison but put into the sort: a player can legitimately reach zero
// margin error - every margin exact, or tips old enough to carry none - and
// then matches a non-entrant on both figures while no longer sitting beside
// them.
test("a player on zero error is not marked level with a non-entrant", () => {
  const ranked = rankSeason([row("zed", 0, 0, 0), row("ann", 0, 0, 3)]);

  assert.deepEqual(
    ranked.map((e) => e.username),
    ["ann", "zed"]
  );
  assert.equal(ranked[1].tied, false, "they are not tied, they are separated");
  assert.equal(ranked[1].rank, 2);
});

// Rows written before roundsTipped was stored have no count on them. A missing
// count is not evidence of not playing, so those keep the order they already
// had rather than being demoted on a guess - see models/GlobalLadders.js.
test("a row with no round count is left where it was", () => {
  const ranked = rankSeason([
    row("ann", 0, 180, 12),
    { user: "old", username: "old", correctTips: 0, marginError: 0 },
  ]);

  assert.deepEqual(
    ranked.map((e) => e.username),
    ["old", "ann"],
    "an unknown count still sorts on margin error, as it did before"
  );
});

test("hasEntered is about the count and nothing else", () => {
  assert.equal(hasEntered({ roundsTipped: 1 }), true);
  assert.equal(hasEntered({ roundsTipped: 0 }), false);
  assert.equal(hasEntered({}), true, "unknown is not the same as none");
  assert.equal(hasEntered({ roundsTipped: undefined }), true);
});

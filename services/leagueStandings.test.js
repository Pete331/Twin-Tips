const test = require("node:test");
const assert = require("node:assert/strict");

const { rankSeason, tallySeason } = require("./leagueStandings");

const entry = (username, correctTips, marginError) => ({
  username,
  correctTips,
  marginError,
});

const order = (ranked) => ranked.map((r) => r.username);
const places = (ranked) => ranked.map((r) => `${r.username}:${r.rank}`);

test("most correct tips comes first, before any margin is looked at", () => {
  const ranked = rankSeason([
    entry("alice", 18, 400),
    entry("bob", 24, 900),
    entry("carol", 21, 12),
  ]);
  assert.deepEqual(order(ranked), ["bob", "carol", "alice"]);
});

test("level on tips, the closest cumulative margin wins", () => {
  const ranked = rankSeason([
    entry("alice", 20, 310),
    entry("bob", 20, 288),
    entry("carol", 20, 502),
  ]);
  assert.deepEqual(order(ranked), ["bob", "alice", "carol"]);
});

// Competition ranking: everyone level shares a place and the next place skips
// past them. Two tied first are both 1st and the next is 3rd, not 2nd.
test("a genuine tie shares a place and the next place skips", () => {
  const ranked = rankSeason([
    entry("alice", 20, 300),
    entry("bob", 20, 300),
    entry("carol", 19, 100),
  ]);
  assert.deepEqual(places(ranked), ["alice:1", "bob:1", "carol:3"]);
  assert.equal(ranked[1].tied, true);
  assert.equal(ranked[2].tied, false);
});

test("three level on both share first, and fourth is fourth", () => {
  const ranked = rankSeason([
    entry("alice", 20, 300),
    entry("bob", 20, 300),
    entry("carol", 20, 300),
    entry("dave", 18, 10),
  ]);
  assert.deepEqual(places(ranked), ["alice:1", "bob:1", "carol:1", "dave:4"]);
});

// Without a final comparison the order of equals depends on whatever order
// the database returned them in, so a page refresh could reshuffle a tie.
test("equals are ordered by name, so a refresh does not reshuffle them", () => {
  const one = rankSeason([entry("zoe", 20, 300), entry("adam", 20, 300)]);
  const two = rankSeason([entry("adam", 20, 300), entry("zoe", 20, 300)]);
  assert.deepEqual(order(one), order(two));
  assert.deepEqual(order(one), ["adam", "zoe"]);
});

test("an empty league has an empty ladder", () => {
  assert.deepEqual(rankSeason([]), []);
});

test("everyone on zero is still ranked, all level", () => {
  const ranked = rankSeason([entry("alice", 0, 0), entry("bob", 0, 0)]);
  assert.deepEqual(places(ranked), ["alice:1", "bob:1"]);
});

// ---------------------------------------------------------------------------

const member = (id, username) => ({ user: { _id: id, username } });

const tip = (user, correctTips, marginTopEight, topEightDifference) => ({
  user,
  correctTips,
  marginTopEight,
  topEightDifference,
  bottomTenDifference: null,
});

test("totals accumulate across rounds", () => {
  const totals = tallySeason(
    [member("u1", "alice")],
    [tip("u1", 2, 10, 5), tip("u1", 1, 10, 20), tip("u1", 1.5, 10, 3)]
  );

  assert.equal(totals[0].correctTips, 4.5);
  assert.equal(totals[0].marginError, 28);
  assert.equal(totals[0].roundsTipped, 3);
});

// A league table that hides its own members until they score is worse than one
// with zeroes in it.
test("a member who has not tipped still appears", () => {
  const totals = tallySeason([member("u1", "alice"), member("u2", "bob")], [
    tip("u1", 2, 10, 5),
  ]);

  const bob = totals.find((t) => t.username === "bob");
  assert.equal(bob.correctTips, 0);
  assert.equal(bob.roundsTipped, 0);
});

test("a tip from someone no longer in the league is ignored", () => {
  const totals = tallySeason([member("u1", "alice")], [
    tip("u1", 2, 10, 5),
    tip("u9", 2, 10, 5),
  ]);

  assert.equal(totals.length, 1);
  assert.equal(totals[0].correctTips, 2);
});

// The margin is read through marginDifference, which knows which of the two
// selections it was entered against. A tip with the margin on the bottom-10
// pick must contribute that difference, not the top-8 one.
test("the margin is taken from the selection it was entered on", () => {
  const onBottom = {
    user: "u1",
    correctTips: 1,
    marginTopEight: 0,
    topEightDifference: 99,
    bottomTenDifference: 7,
  };

  const totals = tallySeason([member("u1", "alice")], [onBottom]);
  assert.equal(totals[0].marginError, 7);
});

test("a tip with no countable margin adds nothing rather than throwing", () => {
  const totals = tallySeason([member("u1", "alice")], [
    tip("u1", 1, 10, null),
    tip("u1", 1, 10, 4),
  ]);

  assert.equal(totals[0].marginError, 4);
  assert.equal(totals[0].roundsTipped, 2);
});

// --- memberFrom / countsFor --------------------------------------------
//
// The rule that stops a late joiner being scored on rounds before they were in
// the league. It was written onto every membership and read by nothing.

const { memberFrom, countsFor } = require("./leagueStandings");

const league = (over = {}) => ({
  _id: "L1",
  createdSeason: 2026,
  startRound: 1,
  ...over,
});

test("a member's own joining round is what counts", () => {
  const from = memberFrom(
    [{ user: "u1", joinedAtRound: 15 }, { user: "u2", joinedAtRound: 1 }],
    league(),
    2026
  );

  assert.equal(countsFor(from, "u1", 14), false);
  assert.equal(countsFor(from, "u1", 15), true);
  assert.equal(countsFor(from, "u2", 1), true);
});

test("the round they joined in counts, not the one after", () => {
  const from = memberFrom([{ user: "u1", joinedAtRound: 15 }], league(), 2026);
  assert.equal(countsFor(from, "u1", 15), true);
});

// A membership written before the field existed. Those rows already behaved as
// though the league's own start applied, and they should keep doing that.
test("a membership with no joining round falls back to the league's", () => {
  const from = memberFrom([{ user: "u1" }], league({ startRound: 4 }), 2026);
  assert.equal(countsFor(from, "u1", 3), false);
  assert.equal(countsFor(from, "u1", 4), true);
});

// joinedAtRound belongs to whatever season the member joined in. A round 15
// join in 2026 must not hold them out of rounds 1-14 of 2027.
test("a later season starts everyone at its own first round", () => {
  const from = memberFrom([{ user: "u1", joinedAtRound: 15 }], league(), 2027);
  assert.equal(countsFor(from, "u1", 1), true);
});

test("a populated membership is read the same as a bare one", () => {
  const from = memberFrom(
    [{ user: { _id: "u1", username: "ann" }, joinedAtRound: 9 }],
    league(),
    2026
  );
  assert.equal(countsFor(from, "u1", 8), false);
  assert.equal(countsFor(from, "u1", 9), true);
});

test("no map at all counts everything, which is what the pure callers want", () => {
  assert.equal(countsFor(undefined, "u1", 1), true);
});

test("someone the map has never heard of is not filtered out", () => {
  const from = memberFrom([{ user: "u1", joinedAtRound: 5 }], league(), 2026);
  assert.equal(countsFor(from, "stranger", 1), true);
});

test("tallySeason drops the rounds before a member joined", () => {
  const from = memberFrom([{ user: "u1", joinedAtRound: 3 }], league(), 2026);
  const totals = tallySeason(
    [member("u1", "alice")],
    [
      { user: "u1", round: 1, correctTips: 2, marginTopEight: 10, topEightDifference: 5 },
      { user: "u1", round: 2, correctTips: 2, marginTopEight: 10, topEightDifference: 5 },
      { user: "u1", round: 3, correctTips: 1, marginTopEight: 10, topEightDifference: 7 },
    ],
    from
  );

  assert.equal(totals[0].roundsTipped, 1);
  assert.equal(totals[0].correctTips, 1);
  assert.equal(totals[0].marginError, 7);
});

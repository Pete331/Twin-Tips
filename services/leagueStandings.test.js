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

// Tests for the half of the scoring engine that talks to the database.
//
//   npm test
//
// results.test.js covers the pure functions - who wins a round, what a
// selection scores - and covers them well. What it cannot reach is
// calculateRound itself: the payout arithmetic, the guard that refuses to score
// an unfinished round, and the write-back that has to zero a previous winner
// when a result is corrected. Those had no coverage at all.
//
// Two of the bugs this module has already carried live in exactly that gap. The
// winnings were compared with includes() against ObjectId instances, which are
// never === for the same id, so every round paid out zero; and the per-user
// writes were fired without being awaited, so the winner could be decided from
// data that had not landed. Neither is reachable from a pure test.
//
// Runs against its own database, which it creates, uses and drops. It never
// touches the development database, and it skips entirely when no local
// MongoDB is listening.
//
// The name is specific to this file, not a shared "twin-tips-test". The test
// runner gives each file its own process but not its own database, so two
// files sharing one name drop each other's fixtures halfway through - which
// shows up as a handful of failures that move around between runs and pass
// when either file is run on its own.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const db = require("../models");
const { calculateRound, calculateSeason } = require("./results");

const URI =
  process.env.RESULTS_TEST_URI || "mongodb://localhost/twin-tips-test-results";
const YEAR = 2099;

let connected = false;

test("calculateRound", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
    connected = true;
  } catch {
    t.skip("no local MongoDB listening - skipping the database-backed tests");
    return;
  }

  // Guard against ever pointing this at real data.
  const name = mongoose.connection.name;
  assert.match(name, /test/, `refusing to run against database "${name}"`);

  const clear = async () => {
    await db.Fixture.deleteMany({});
    await db.Tip.deleteMany({});
  };

  // One game, decided by `margin`. Home wins when positive.
  const fixture = (round, margin, complete = 100) => ({
    id: round * 100 + 1,
    year: YEAR,
    round,
    complete,
    hteam: "Geelong",
    hteamid: 7,
    ateam: "Essendon",
    ateamid: 5,
    hscore: 80 + Math.max(margin, 0),
    ascore: 80 + Math.max(-margin, 0),
    winner: margin > 0 ? "Geelong" : "Essendon",
    winnerteamid: margin > 0 ? 7 : 5,
    is_final: 0,
  });

  // A tip on Geelong with a predicted margin. The real margin is 30, so a
  // prediction of 30 is exact.
  const tip = (round, margin) => ({
    user: new mongoose.Types.ObjectId(),
    round,
    season: YEAR,
    topEightSelection: "Geelong",
    bottomTenSelection: "Essendon",
    marginTopEight: margin,
    marginBottomTen: 0,
  });

  const winningsFor = async (round) => {
    const rows = await db.Tip.find({ season: YEAR, round }).select("winnings").lean();
    return rows.map((r) => r.winnings).sort((a, b) => b - a);
  };

  await t.test("an unfinished round is not scored", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30, 50));
    await db.Tip.create(tip(1, 30));

    const result = await calculateRound(YEAR, 1);
    assert.equal(result.complete, false);
    assert.equal(result.scored, 0);

    const stored = await db.Tip.findOne({ season: YEAR, round: 1 });
    assert.equal(stored.correctTips, undefined, "nothing should have been written");
  });

  await t.test("a round with no tips is complete but scores nobody", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));

    const result = await calculateRound(YEAR, 1);
    assert.equal(result.complete, true);
    assert.equal(result.scored, 0);
    assert.deepEqual(result.winners, []);
  });

  // The arithmetic that pays people. Winnings are in entry units - one stake is
  // 1 - so a round of four entrants has a pool of four whatever the buy-in is.
  await t.test("one winner takes the whole pool", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));
    await db.Tip.create([tip(1, 30), tip(1, 10), tip(1, 25)]);

    const result = await calculateRound(YEAR, 1);
    assert.equal(result.winners.length, 1);
    assert.equal(result.winnings, 3, "three entrants, one winner");
    assert.deepEqual(await winningsFor(1), [3, 0, 0]);
  });

  await t.test("two winners split it, and the pool balances", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));
    await db.Tip.create([tip(1, 30), tip(1, 30), tip(1, 5), tip(1, 12)]);

    const result = await calculateRound(YEAR, 1);
    assert.equal(result.winners.length, 2);

    const paid = await winningsFor(1);
    assert.deepEqual(paid, [2, 2, 0, 0]);

    // Nothing invented and nothing lost: what goes out equals what came in.
    const out = paid.reduce((n, w) => n + w, 0);
    assert.equal(out, 4, "four stakes in, four paid out");
  });

  await t.test("a pool that does not divide keeps its precision", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));
    // Four exact tips out of ten entrants.
    const tips = [];
    for (let i = 0; i < 4; i += 1) tips.push(tip(1, 30));
    for (let i = 0; i < 6; i += 1) tips.push(tip(1, i + 1));
    await db.Tip.create(tips);

    const result = await calculateRound(YEAR, 1);
    assert.equal(result.winners.length, 4);
    assert.equal(result.winnings, 2.5);

    const paid = await winningsFor(1);
    const out = paid.reduce((n, w) => n + w, 0);
    assert.equal(out, 10, "ten stakes in, ten paid out - no rounding drift");
  });

  // Two ObjectId instances for the same id are never ===, so the winner lookup
  // has to compare strings. When it used includes() every round paid out zero,
  // and the pure tests kept passing because they use string users.
  await t.test("winners are matched across ObjectId instances", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));
    const winner = tip(1, 30);
    await db.Tip.create([winner, tip(1, 40)]);

    await calculateRound(YEAR, 1);

    const paid = await db.Tip.findOne({ season: YEAR, round: 1, user: winner.user });
    assert.equal(paid.winnings, 2, "the exact tipster should hold the whole pool");
  });

  // A result is corrected after the round was scored. The previous winner must
  // lose the money, not merely fail to gain more.
  await t.test("a corrected result moves the winnings and zeroes the old winner", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));
    const exact = tip(1, 30);
    const other = tip(1, 10);
    await db.Tip.create([exact, other]);

    await calculateRound(YEAR, 1);
    let paidExact = await db.Tip.findOne({ user: exact.user });
    assert.equal(paidExact.winnings, 2);

    // Squiggle corrects the score: Geelong actually won by 10.
    await db.Fixture.updateOne({ year: YEAR, round: 1 }, { $set: { hscore: 90, ascore: 80 } });
    await calculateRound(YEAR, 1);

    paidExact = await db.Tip.findOne({ user: exact.user });
    const paidOther = await db.Tip.findOne({ user: other.user });
    assert.equal(paidExact.winnings, 0, "the old winner must be zeroed, not left paid");
    assert.equal(paidOther.winnings, 2, "the money moves to whoever is now closest");
  });

  await t.test("scoring the same round twice lands on the same answer", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));
    await db.Tip.create([tip(1, 30), tip(1, 12)]);

    await calculateRound(YEAR, 1);
    const first = await winningsFor(1);
    await calculateRound(YEAR, 1);
    const second = await winningsFor(1);

    assert.deepEqual(first, second);
  });

  await t.test("a losing tip is written a zero, not left unset", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30));
    const loser = tip(1, 5);
    await db.Tip.create([tip(1, 30), loser]);

    await calculateRound(YEAR, 1);
    const stored = await db.Tip.findOne({ user: loser.user });
    assert.equal(stored.winnings, 0);
    assert.equal(stored.correctTips, 1, "they still tipped the winner, just not the margin");
  });

  await t.test("calculateSeason scores the complete rounds and skips the rest", async () => {
    await clear();
    await db.Fixture.create([
      fixture(1, 30),
      fixture(2, 20),
      fixture(3, 15, 50), // still being played
    ]);
    await db.Tip.create([tip(1, 30), tip(2, 20), tip(3, 15)]);

    const result = await calculateSeason(YEAR);
    assert.equal(result.rounds, 2, "rounds 1 and 2 only");
    assert.equal(result.scored, 2);

    const unscored = await db.Tip.findOne({ season: YEAR, round: 3 });
    assert.equal(unscored.correctTips, undefined);
  });

  // Leave nothing behind.
  await db.Fixture.deleteMany({});
  await db.Tip.deleteMany({});
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  connected = false;
});

process.on("exit", () => {
  if (connected) mongoose.disconnect();
});

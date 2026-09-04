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

  // Registered here rather than as a trailing statement, so it runs whether
  // these pass, fail or throw. As the last line of the test body it only ran on
  // the happy path, and one failure left the test database behind.
  //
  // Disconnected before the drop, and dropped with a client of our own.
  // mongoose builds indexes lazily and recreates the collections it knows about
  // the moment after a database is dropped, so dropping while still connected
  // leaves an empty database standing rather than none at all - which is
  // exactly what was found sitting on this machine.
  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;

    await mongoose.disconnect();

    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

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

  // --- the re-score window ------------------------------------------------
  //
  // calculateSeason no longer walks the whole season every run. The risk in
  // that is a skip that should not have happened, which does not fail loudly -
  // it silently stops paying somebody - so each of these is about a round that
  // must still be reached.

  // Rounds are seeded so the latest played is 20; with a window of 4, rounds
  // 16 and up are in and everything below is out.
  const seedSeason = async () => {
    await clear();
    for (const round of [1, 5, 17, 20]) {
      await db.Fixture.create(fixture(round, 30));
      await db.Tip.create([tip(round, 30), tip(round, 9)]);
    }
  };

  await t.test("recent rounds are re-scored, older ones are left alone", async () => {
    await seedSeason();
    // Score everything once, so nothing is left unscored.
    await calculateSeason(YEAR, { recentRounds: 99 });

    const result = await calculateSeason(YEAR, { recentRounds: 4 });
    assert.equal(result.skipped, 2, "rounds 1 and 5 are outside the window");
    assert.equal(result.rounds, 2, "rounds 17 and 20 are inside it");
  });

  // The whole point of keeping a window rather than scoring once: a score
  // corrected within it still moves the money.
  await t.test("a correction inside the window still lands", async () => {
    await seedSeason();
    await calculateSeason(YEAR, { recentRounds: 99 });

    const before = await db.Tip.find({ season: YEAR, round: 20 }).select("winnings").lean();
    assert.deepEqual(before.map((t) => t.winnings).sort((a, b) => b - a), [2, 0]);

    // Round 20 is re-decided: the margin was 9, not 30.
    await db.Fixture.updateOne(
      { year: YEAR, round: 20 },
      { $set: { hscore: 89, ascore: 80 } }
    );
    await calculateSeason(YEAR, { recentRounds: 4 });

    const after = await db.Tip.find({ season: YEAR, round: 20 }).select("winnings marginTopEight").lean();
    const paid = after.find((t) => t.winnings > 0);
    assert.equal(paid.marginTopEight, 9, "the money moved to whoever is now closest");
  });

  // A season part way through has rounds still to come, and counting the window
  // back from the last one on the calendar would put every round being played
  // outside it. Every round in the seed above is finished, so that mistake is
  // invisible there - this is the case that catches it.
  await t.test("the window counts from football played, not from the calendar", async () => {
    await clear();
    for (const round of [1, 5, 17, 20]) {
      await db.Fixture.create(fixture(round, 30));
      await db.Tip.create([tip(round, 30), tip(round, 9)]);
    }
    // Still to come, as a real fixture list has all season.
    for (const round of [25, 30]) {
      await db.Fixture.create(fixture(round, 30, 0));
    }
    await calculateSeason(YEAR, { recentRounds: 99 });

    const result = await calculateSeason(YEAR, { recentRounds: 4 });
    assert.equal(result.rounds, 2, "17 and 20 are within four of the latest round played");
    assert.ok(result.skipped >= 2, "1 and 5 are outside it");
  });

  // The window the sync actually runs with. Every other case here passes one
  // explicitly, so without this the default could be anything at all.
  await t.test("the default window is a usable one", async () => {
    await seedSeason();
    await calculateSeason(YEAR, { recentRounds: 99 });

    const explicit = await calculateSeason(YEAR, { recentRounds: 4 });
    const byDefault = await calculateSeason(YEAR);

    assert.equal(byDefault.rounds, explicit.rounds);
    assert.equal(byDefault.skipped, explicit.skipped);
    assert.ok(byDefault.rounds > 1, "a default that reaches one round is not a window");
  });

  // A round the sync never got to must be picked up whenever it comes back,
  // however old it is by then. This is the case a naive window would step over.
  await t.test("a round that was never scored is picked up however old", async () => {
    await seedSeason();
    await calculateSeason(YEAR, { recentRounds: 99 });

    // Round 1 loses its scoring, which is the state a sync that was down for a
    // month leaves behind. It sits far outside the window, so only the
    // never-scored condition can reach it.
    await db.Tip.updateMany(
      { season: YEAR, round: 1 },
      { $unset: { correctTips: "", winnings: "" } }
    );

    const result = await calculateSeason(YEAR, { recentRounds: 4 });

    const now = await db.Tip.findOne({ season: YEAR, round: 1 });
    assert.equal(now.correctTips, 1, "round 1 scored despite being outside the window");
    assert.equal(result.skipped, 1, "round 5 is still skipped - it was already scored");
  });

  // Pre-season: nothing played, so nothing to count back from. Everything is
  // in the window rather than everything being outside it.
  await t.test("with nothing played yet, no round is skipped", async () => {
    await clear();
    await db.Fixture.create(fixture(1, 30, 0));
    await db.Tip.create(tip(1, 30));

    const result = await calculateSeason(YEAR, { recentRounds: 4 });
    assert.equal(result.skipped, 0);
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
});

process.on("exit", () => {
  if (connected) mongoose.disconnect();
});

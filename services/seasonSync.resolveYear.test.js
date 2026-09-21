// Which season a scheduled run targets, and what happens when Squiggle is slow.
//
// This is the first thing the hourly job does and the first thing that touches
// the network, and it used to throw when that network call timed out. Nothing
// caught it: scripts/syncSeason.js resolved the year above the try/catch that
// wraps everything else, so the error was unhandled and the run exited with
// status 1 - taking the odds poll with it, which asks Squiggle for nothing.
//
// It happened in production on 21 September:
//
//   Error: Squiggle did not respond within 15000ms
//     at async Object.resolveSyncYear (services/seasonSync.js:320)
//     at async scripts/syncSeason.js:37
//   Your cronjob failed because of an error: Exited with status 1
//
// A slow Squiggle and a Squiggle with no fixtures leave this function in the
// same position - no answer from them - and it already knew what to do in that
// position, which is to read the most recent season out of the database. The
// tests below are mostly about the two staying distinguishable afterwards: a
// fallback nobody can tell from a normal answer is how a silently wrong season
// would get synced for a month.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const db = require("../models");

const URI =
  process.env.RESOLVE_TEST_URI || "mongodb://localhost/twin-tips-test-resolve";

const THIS_YEAR = new Date().getFullYear();

test("resolveSyncYear", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);

  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;

    await mongoose.disconnect();

    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

  const realFetch = global.fetch;

  const serve = (games) => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ games }),
    });
  };

  // What a timed-out Squiggle looks like from here: the client turns an
  // AbortError into this, and it is what reached the top of the cron job.
  const timeout = () => {
    global.fetch = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };
  };

  // Required after stubbing fetch so the squiggle client picks it up, and so
  // its response cache does not carry between cases.
  const fresh = () => {
    delete require.cache[require.resolve("./squiggle")];
    delete require.cache[require.resolve("./seasonSync")];
    return require("./seasonSync");
  };

  const storedSeason = (year) =>
    db.Fixture.create({ id: 990000 + year, year, round: 1, hteam: "Adelaide" });

  await t.test("takes this year when Squiggle has fixtures for it", async () => {
    await db.Fixture.deleteMany({});
    serve([{ id: 1, year: THIS_YEAR, round: 1 }]);

    const resolved = await fresh().resolveSyncYear();

    assert.equal(resolved.year, THIS_YEAR);
    assert.equal(resolved.fellBack, false);
    assert.equal(resolved.unreachable, null);
  });

  await t.test("falls back when Squiggle has none, and says so", async () => {
    await db.Fixture.deleteMany({});
    await storedSeason(THIS_YEAR - 1);
    serve([]);

    const resolved = await fresh().resolveSyncYear();

    assert.equal(resolved.year, THIS_YEAR - 1);
    assert.equal(resolved.fellBack, true);
    assert.equal(
      resolved.unreachable,
      null,
      "Squiggle answered - it just had nothing"
    );
  });

  // The bug. Before this, the timeout came out of here as a throw.
  await t.test("does not throw when Squiggle times out", async () => {
    await db.Fixture.deleteMany({});
    await storedSeason(THIS_YEAR - 1);
    timeout();

    const resolved = await fresh().resolveSyncYear();

    assert.equal(resolved.year, THIS_YEAR - 1, "the stored season is the answer");
    assert.ok(resolved.unreachable, "and the reason is carried, not swallowed");
    assert.match(resolved.unreachable, /15000ms|timeout/i);
  });

  // Two different things that both end in a fallback. A caller that cannot
  // tell them apart reports a dead upstream as though it were a quiet season.
  await t.test("an outage is distinguishable from an empty season", async () => {
    await db.Fixture.deleteMany({});
    await storedSeason(THIS_YEAR - 1);

    serve([]);
    const empty = await fresh().resolveSyncYear();

    timeout();
    const down = await fresh().resolveSyncYear();

    assert.equal(empty.year, down.year, "both land on the same season");
    assert.equal(empty.unreachable, null);
    assert.ok(down.unreachable);
  });

  // A first run against an empty database with Squiggle down. There is no
  // stored season to fall back to, so this hands back the calendar year and
  // lets the sync fail with the real reason rather than inventing one.
  await t.test("with nothing stored it still answers", async () => {
    await db.Fixture.deleteMany({});
    timeout();

    const resolved = await fresh().resolveSyncYear();

    assert.equal(resolved.year, THIS_YEAR);
    assert.equal(resolved.fellBack, false);
    assert.ok(resolved.unreachable);
  });

  global.fetch = realFetch;
  await db.Fixture.deleteMany({});
});

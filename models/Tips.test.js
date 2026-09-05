// What the Tips schema insists on.
//
// It insisted on nothing: every field was optional, and the only thing checking
// a tip was complete was POST /api/tips, which is one of several ways a tip
// gets written. A tip missing user, round or season escapes the unique index -
// its partial filter tests for exactly those three types - so the constraint
// stopping a double submission does not cover it, and it is invisible to every
// season-scoped read. Ten such documents from 2022 are still in the collection.
//
// Two mechanisms are needed rather than one, because `required` does not reach
// the path that actually creates tips. Every tip is written by an upsert, and
// Mongoose's update validators do not apply required to one - measured, with
// runValidators both on and off. So `required` covers create() and save(), and
// a pre hook covers the upsert.
//
// The case worth protecting hardest is the last one here: scoring writes back
// to existing tips with a plain update, and a guard that held those to the full
// shape would stop every round being scored.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("./index");

const URI =
  process.env.TIPS_MODEL_TEST_URI || "mongodb://localhost/twin-tips-test-tipsmodel";

const YEAR = 2095;

let reachable = true;

const connect = async () => {
  if (mongoose.connection.readyState === 1) return true;
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
    return true;
  } catch {
    reachable = false;
    return false;
  }
};

// Once, after every test in the file, rather than after each one.
//
// Per-test teardown left the database behind. models/index.js registers every
// model, so each reconnect has Mongoose build indexes for all of them, which
// creates their collections - and a build still in flight from the last
// reconnect lands after the drop and recreates the database. Dropping once at
// the end has nothing left to race with.
//
// A hook rather than a trailing statement, because a hook still runs when a
// test fails and a trailing statement does not.
const teardown = async () => {
  if (!reachable) return;
  try {
    await mongoose.disconnect();
    const client = await MongoClient.connect(URI, {
      serverSelectionTimeoutMS: 1500,
    });
    await client.db().dropDatabase();
    await client.close();
  } catch {
    // Nothing to clean up if it was never reachable.
  }
};

after(teardown);

const user = () => new mongoose.Types.ObjectId();

const rejects = async (fn) => {
  try {
    await fn();
    return null;
  } catch (err) {
    return err.message;
  }
};

test("a tip created without its three identifying fields is refused", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  const noUser = await rejects(() =>
    db.Tip.create({ round: 5, season: YEAR, topEightSelection: "Adelaide" })
  );
  assert.match(noUser || "", /user/, "no user is refused");

  const noRound = await rejects(() =>
    db.Tip.create({ user: user(), season: YEAR, topEightSelection: "Adelaide" })
  );
  assert.match(noRound || "", /round/, "no round is refused");

  const noSeason = await rejects(() =>
    db.Tip.create({ user: user(), round: 5, topEightSelection: "Adelaide" })
  );
  assert.match(noSeason || "", /season/, "no season is refused");
});

test("a complete tip is created", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  const tip = await db.Tip.create({
    user: user(),
    round: 5,
    season: YEAR,
    topEightSelection: "Adelaide",
    marginTopEight: 20,
  });

  assert.equal(tip.round, 5);
  assert.equal(tip.winnings, 0, "winnings still default to nothing");
});

// The path POST /api/tips actually uses. required does not apply here, which is
// what the pre hook is for.
test("an upsert missing a required field is refused", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  const message = await rejects(() =>
    db.Tip.findOneAndUpdate(
      { user: user(), round: 11 },
      { topEightSelection: "Adelaide" },
      { upsert: true, returnDocument: "after" }
    )
  );

  assert.match(message || "", /season/);
  assert.equal(
    await db.Tip.countDocuments({ round: 11 }),
    0,
    "and nothing was written"
  );
});

test("the upsert POST /api/tips makes is allowed through", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  const id = user();
  const written = await db.Tip.findOneAndUpdate(
    { user: id, round: 7, season: YEAR },
    {
      topEightSelection: "Adelaide",
      bottomTenSelection: "Melbourne",
      marginTopEight: 20,
      marginBottomTen: 0,
      season: YEAR,
    },
    { upsert: true, returnDocument: "after" }
  );

  assert.equal(written.round, 7);
  assert.equal(written.season, YEAR);
  assert.equal(String(written.user), String(id));
});

// The fields are taken from the query and the update together, because an
// upsert builds the new document from both. Reading only one would refuse a
// write that is actually complete.
test("a field named in the update rather than the query still counts", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  const id = user();
  const written = await db.Tip.findOneAndUpdate(
    { user: id, round: 8 },
    { $set: { season: YEAR, topEightSelection: "Adelaide" } },
    { upsert: true, returnDocument: "after" }
  );

  assert.equal(written.season, YEAR);
});

// The one that would hurt. services/results.js writes scores back with a plain
// updateOne whose update names none of the three, and a guard applied to every
// update rather than to upserts alone would stop every round being scored.
test("scoring an existing tip is untouched by any of this", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  const id = user();
  await db.Tip.create({
    user: id,
    round: 9,
    season: YEAR,
    topEightSelection: "Adelaide",
    marginTopEight: 20,
  });

  const result = await db.Tip.updateOne(
    { user: id, round: 9, season: YEAR },
    {
      $set: {
        topEightCorrect: 1,
        bottomTenCorrect: 0,
        correctTips: 1,
        winnings: 2,
      },
    }
  );

  assert.equal(result.modifiedCount, 1);

  const scored = await db.Tip.findOne({ user: id, round: 9, season: YEAR });
  assert.equal(scored.correctTips, 1);
  assert.equal(scored.winnings, 2);
});

// The gate is on upserts, not on updates, and this is the difference.
//
// Every update the app makes today happens to name all three fields in its
// query, so the gate is not load-bearing for any current caller. It is still
// the right line to draw: a plain update targets documents that already exist
// and has no business being held to the shape of a new one. A broad fix-up -
// correcting a season's worth of tips in one statement - is an ordinary thing
// to want, and a guard that ran on every update would refuse it.
test("a plain update scoped only by season is allowed", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  await db.Tip.create([
    { user: user(), round: 1, season: YEAR, topEightSelection: "Adelaide" },
    { user: user(), round: 2, season: YEAR, topEightSelection: "Carlton" },
  ]);

  const result = await db.Tip.updateMany(
    { season: YEAR },
    { $set: { winnings: 0 } }
  );

  assert.equal(result.matchedCount, 2, "both tips were reachable");
});

// Documents already in the collection are not revalidated by being read, which
// is what keeps the 2022 shells from breaking anything that lists them.
test("existing incomplete documents can still be read", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await db.Tip.deleteMany({ season: YEAR });

  // Inserted underneath Mongoose, the way the 2022 rows got there.
  await mongoose.connection.db
    .collection("tips")
    .insertOne({ topEightSelection: "Adelaide", winnings: 0 });

  const shells = await db.Tip.find({ user: { $exists: false } });
  assert.equal(shells.length, 1, "a document with no user still reads back");

  await mongoose.connection.db
    .collection("tips")
    .deleteMany({ user: { $exists: false } });
});

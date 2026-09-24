// Who appears on the Overall Site Ladder.
//
// A league table lists its members whether they have tipped or not, and should:
// membership is something you opted into, and a league that hides its own
// members until they score is worse than one with zeroes in it.
//
// This table is not that table. Its population is db.User.find({}) - every
// account ever registered - so nobody is "in" it. A signup from three seasons
// ago that never entered a round is not a participant sitting on nothing, it
// is an account, and a ladder mostly made of them says nothing about the
// competition.
//
// So they are left out of the standings and counted instead: registered is the
// fact the empty rows were carrying, in the space of a number.
//
// The stored ladder still holds everybody. The filtering happens on the way
// out, so nothing is lost and the decision stays reversible.
//
// Runs against its own database, which it creates and drops.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const globalLadder = require("./globalLadder");

const URI =
  process.env.GLOBAL_PLAYERS_TEST_URI ||
  "mongodb://localhost/twin-tips-test-globalplayers";

const YEAR = 2090;

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

after(async () => {
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
});

let unique = 0;

const makeUser = (name) => {
  unique += 1;
  return db.User.create({
    username: name,
    email: `${name}-${unique}@seed.invalid`,
    password: "x",
    firstName: "Test",
    lastName: "Person",
    favTeam: 1,
  });
};

// A home-and-away fixture, so homeAndAwayRounds has a round to find. Without
// one the season has no rounds and every tip is out of scope.
const fixture = (round) =>
  db.Fixture.create({
    id: 700000 + round,
    year: YEAR,
    round,
    roundname: `Round ${round}`,
    hteam: "Adelaide",
    ateam: "Melbourne",
    hteamid: 1,
    ateamid: 11,
    complete: 100,
    is_final: 0,
    date: new Date(`${YEAR}-04-0${round}T09:20:00.000Z`),
  });

const tip = (user, round, over = {}) =>
  db.Tip.create({
    user: user._id,
    season: YEAR,
    round,
    topEightSelection: "Adelaide",
    bottomTenSelection: "Melbourne",
    marginTopEight: 20,
    marginBottomTen: 0,
    topEightCorrect: 1,
    bottomTenCorrect: 0,
    topEightDifference: 5,
    bottomTenDifference: null,
    correctTips: 1,
    ...over,
  });

const clear = async () => {
  await db.Tip.deleteMany({});
  await db.User.deleteMany({});
  await db.Fixture.deleteMany({});
  await db.GlobalLadder.deleteMany({});
};

test("who the site ladder lists", async (t) => {
  if (!(await connect())) {
    t.skip("no local MongoDB listening - skipping");
    return;
  }

  assert.match(
    mongoose.connection.name,
    /test/,
    `refusing to run against database "${mongoose.connection.name}"`
  );

  await t.test("leaves out accounts that have never entered", async () => {
    await clear();
    await fixture(1);
    const ann = await makeUser("ann");
    await makeUser("ghost");
    await makeUser("spectre");
    await tip(ann, 1);

    const ladder = await globalLadder.get(YEAR);

    assert.deepEqual(
      ladder.standings.map((s) => s.username),
      ["ann"]
    );
  });

  // The fact the empty rows were carrying, kept as a number so the page can
  // still say how many people have signed up without printing them all.
  await t.test("and counts them instead", async () => {
    await clear();
    await fixture(1);
    const ann = await makeUser("ann");
    await makeUser("ghost");
    await makeUser("spectre");
    await tip(ann, 1);

    const ladder = await globalLadder.get(YEAR);

    assert.equal(ladder.registered, 3);
    assert.equal(ladder.standings.length, 1);
  });

  // Filtering on the way out, not on the way in. The snapshot is the record of
  // the season and keeps everyone, so this can be undone by changing one
  // function rather than by rebuilding every stored ladder.
  await t.test("but the stored ladder still holds everybody", async () => {
    await clear();
    await fixture(1);
    const ann = await makeUser("ann");
    await makeUser("ghost");
    await tip(ann, 1);

    await globalLadder.get(YEAR);

    const stored = await db.GlobalLadder.findOne({ season: YEAR });
    assert.equal(
      stored.standings.length,
      2,
      "the snapshot keeps the non-entrant"
    );
  });

  // The cached branch and the fresh branch are separate code paths returning
  // the same shape, and only one of them was ever exercised by a test before.
  await t.test(
    "the cached read answers the same way as a rebuild",
    async () => {
      await clear();
      await fixture(1);
      const ann = await makeUser("ann");
      await makeUser("ghost");
      await tip(ann, 1);

      const rebuilt = await globalLadder.get(YEAR);
      assert.equal(rebuilt.rebuilt, true, "first read should build it");

      const cached = await globalLadder.get(YEAR);
      assert.equal(
        cached.rebuilt,
        false,
        "second read should come from the cache"
      );

      assert.deepEqual(
        cached.standings.map((s) => s.username),
        rebuilt.standings.map((s) => s.username)
      );
      assert.equal(cached.registered, rebuilt.registered);
    }
  );

  // Somebody who tipped and scored nothing is a player having a bad season,
  // not a non-entrant, and the two are not to be confused by a filter reading
  // correctTips instead of the round count.
  await t.test(
    "somebody who tipped and scored nothing still appears",
    async () => {
      await clear();
      await fixture(1);
      const ann = await makeUser("ann");
      const bob = await makeUser("bob");
      await tip(ann, 1);
      await tip(bob, 1, {
        correctTips: 0,
        topEightCorrect: 0,
        bottomTenCorrect: 0,
        topEightDifference: 90,
      });

      const ladder = await globalLadder.get(YEAR);

      assert.deepEqual(ladder.standings.map((s) => s.username).sort(), [
        "ann",
        "bob",
      ]);
    }
  );

  // And a season nobody has tipped is empty rather than a list of everyone on
  // nothing, which is what the pre-season ladder used to be.
  await t.test("a season nobody has entered lists nobody", async () => {
    await clear();
    await fixture(1);
    await makeUser("ann");
    await makeUser("bob");

    const ladder = await globalLadder.get(YEAR);

    assert.deepEqual(ladder.standings, []);
    assert.equal(ladder.registered, 2);
  });
});

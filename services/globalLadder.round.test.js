// One round of the Overall Site Ladder.
//
// The same question a league answers with leagueRounds.roundDetail, asked of
// everybody instead of a membership - and it shares the ranking rule rather
// than restating it, so the two tables cannot come to disagree about who drew
// with whom.
//
// Two things here are not a league's behaviour and are the reason this exists:
// the money is read off the tips rather than worked out again, because
// services/results.js already settled that pool; and nobody's picks are
// returned before the round locks out.
//
// Runs against its own database, which it creates and drops. The runner gives
// each file its own process but not its own database, so the name is this
// file's alone.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const globalLadder = require("./globalLadder");

const URI =
  process.env.GLOBAL_ROUND_TEST_URI ||
  "mongodb://localhost/twin-tips-test-globalround";

const YEAR = 2091;
const ROUND = 5;

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

// A scored tip. correctTips and the two differences are what scoring writes,
// and winnings is the share services/results.js worked out for the site pool.
const tip = (user, over = {}) =>
  db.Tip.create({
    user: user._id,
    season: YEAR,
    round: ROUND,
    topEightSelection: "Adelaide",
    bottomTenSelection: "Melbourne",
    marginTopEight: 20,
    marginBottomTen: 0,
    topEightCorrect: 1,
    bottomTenCorrect: 1,
    topEightDifference: 5,
    bottomTenDifference: null,
    correctTips: 2,
    winnings: 0,
    ...over,
  });

const clear = async () => {
  await db.Tip.deleteMany({});
  await db.User.deleteMany({});
};

const named = (standings) => standings.map((s) => s.username);

test("the site ladder's round", async (t) => {
  if (!(await connect())) {
    t.skip("no local MongoDB listening - skipping");
    return;
  }

  assert.match(
    mongoose.connection.name,
    /test/,
    `refusing to run against database "${mongoose.connection.name}"`
  );

  await t.test("ranks on correct tips, then the closest margin", async () => {
    await clear();
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    const cat = await makeUser("cat");

    await tip(ann, { correctTips: 1, topEightDifference: 3 });
    await tip(bob, { correctTips: 2, topEightDifference: 40 });
    await tip(cat, { correctTips: 2, topEightDifference: 6 });

    const detail = await globalLadder.roundDetail(YEAR, ROUND);

    assert.deepEqual(named(detail.standings), ["cat", "bob", "ann"]);
    assert.deepEqual(
      detail.standings.map((s) => s.rank),
      [1, 2, 3]
    );
    assert.equal(detail.entrants, 3);
    assert.equal(detail.status, "scored");
  });

  // Everybody appears, which is the population the season ladder uses. Somebody
  // who never tipped is not absent from the table, they sat the round out - and
  // missing a round is a free pass here, so they must not read as having come
  // last on merit.
  await t.test("somebody who did not tip is listed, not ranked", async () => {
    await clear();
    const ann = await makeUser("ann");
    await makeUser("quiet");
    await tip(ann);

    const detail = await globalLadder.roundDetail(YEAR, ROUND);
    const quiet = detail.standings.find((s) => s.username === "quiet");

    assert.equal(detail.standings.length, 2);
    assert.equal(quiet.status, "noTip");
    assert.equal(quiet.rank, null);
    assert.equal(named(detail.standings)[1], "quiet", "after everyone who played");
  });

  // The money is already decided. services/results.js splits the site pool when
  // it scores the round and writes each share onto the tip, so this reads it -
  // recomputing would be a second opinion about a payout already made.
  await t.test("the winner comes from what was paid, not from a fresh count", async () => {
    await clear();
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");

    // bob has the better round on the ranking rule, and ann is the one holding
    // the money. The stored payout wins.
    await tip(ann, { correctTips: 1, topEightDifference: 50, winnings: 2 });
    await tip(bob, { correctTips: 2, topEightDifference: 1, winnings: 0 });

    const detail = await globalLadder.roundDetail(YEAR, ROUND);
    const rowFor = (name) => detail.standings.find((s) => s.username === name);

    assert.deepEqual(detail.winners, ["ann"]);
    assert.equal(rowFor("ann").won, true);
    assert.equal(rowFor("ann").winnings, 2);
    assert.equal(rowFor("bob").won, false);
    assert.equal(rowFor("bob").rank, 1, "still first on the round's own rule");
  });

  // A pool with no buy-in. The page reads these two apart: pays says there is a
  // winner worth marking, buyIn says there is no amount to print against it.
  await t.test("there is a pool and no buy-in", async () => {
    await clear();
    await tip(await makeUser("ann"));

    const detail = await globalLadder.roundDetail(YEAR, ROUND);

    assert.equal(detail.pays, true);
    assert.equal(detail.buyIn, 0);
  });

  await t.test("a shared place is marked on both rows", async () => {
    await clear();
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    const cat = await makeUser("cat");

    await tip(ann, { correctTips: 2, topEightDifference: 5 });
    await tip(bob, { correctTips: 2, topEightDifference: 5 });
    await tip(cat, { correctTips: 1, topEightDifference: 1 });

    const detail = await globalLadder.roundDetail(YEAR, ROUND);
    const rowFor = (name) => detail.standings.find((s) => s.username === name);

    assert.equal(rowFor("ann").rank, 1);
    assert.equal(rowFor("bob").rank, 1);
    assert.equal(rowFor("ann").tied, true);
    assert.equal(rowFor("bob").tied, true);
    assert.equal(rowFor("cat").rank, 3, "two people took first, so this is third");
    assert.equal(rowFor("cat").tied, false);
  });

  await t.test("a round nobody tipped is not a round anybody lost", async () => {
    await clear();
    await makeUser("ann");

    const detail = await globalLadder.roundDetail(YEAR, ROUND);

    assert.equal(detail.status, "noEntries");
    assert.equal(detail.entrants, 0);
    assert.deepEqual(detail.winners, []);
    assert.equal(detail.standings[0].status, "noTip");
  });

  // --- before the bounce -------------------------------------------------

  // The route decides this from the season state; the service is told. What
  // matters here is that being told means the picks do not leave the server -
  // not that a page declines to draw them.
  await t.test("no picks at all before the round locks out", async () => {
    await clear();
    const ann = await makeUser("ann");
    await tip(ann, { topEightSelection: "Geelong", marginTopEight: 31 });

    const detail = await globalLadder.roundDetail(YEAR, ROUND, {
      showSelections: false,
    });
    const row = detail.standings[0];

    assert.equal(row.topEightSelection, null);
    assert.equal(row.bottomTenSelection, null);
    assert.equal(row.marginTopEight, null);
    assert.equal(row.marginBottomTen, null);

    assert.equal(
      JSON.stringify(detail).includes("Geelong"),
      false,
      "the team must not appear anywhere in the response"
    );
    // The margin is checked as the field it is, not as a substring of the
    // whole response. "31" is two digits that turn up inside an ObjectId often
    // enough that this passed alone and failed in a full run. A team name is
    // distinctive enough for the check above; a number is not.
    for (const other of detail.standings) {
      assert.equal(other.marginTopEight, null);
      assert.equal(other.marginBottomTen, null);
    }
  });

  // Who has entered is not the secret - the dashboard says so already, and it
  // is what makes a reminder possible.
  await t.test("but who has entered is still said", async () => {
    await clear();
    const ann = await makeUser("ann");
    await makeUser("quiet");
    await tip(ann);

    const detail = await globalLadder.roundDetail(YEAR, ROUND, {
      showSelections: false,
    });
    const rowFor = (name) => detail.standings.find((s) => s.username === name);

    assert.equal(rowFor("ann").status, "entered");
    assert.equal(rowFor("quiet").status, "noTip");
  });

  // Nothing is decided before a game is played: every entrant has null correct
  // tips and a null margin, so they all rank level and the table would read
  // "=1." against every name in the competition.
  await t.test("and nobody is ranked or paid yet", async () => {
    await clear();
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    await tip(ann, { winnings: 3 });
    await tip(bob);

    const detail = await globalLadder.roundDetail(YEAR, ROUND, {
      showSelections: false,
    });

    assert.deepEqual(detail.winners, []);
    for (const row of detail.standings) {
      assert.equal(row.rank, null);
      assert.equal(row.tied, false);
      assert.equal(row.won, false);
      assert.equal(row.winnings, 0);
      assert.equal(row.correctTips, null);
    }
  });
});

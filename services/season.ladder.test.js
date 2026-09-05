// What getSeasonState says about the ladder the round is being judged on.
//
// The top 8 / bottom 10 split is the rule of this competition, so when the
// ladder behind it is not the one the round should be played against, the page
// has to be told. There are two separate ways that happens and they have
// different remedies:
//
//   ladderStale        the snapshot for the previous round is missing entirely
//                      and an older one is standing in. Waiting on a snapshot.
//   ladderProvisional  the right round's snapshot exists, but was taken while
//                      one of its games was still unplayed. Waiting on a match.
//
// Both were computed before this file existed. Only the first was ever read -
// the second shipped in the payload with no consumer anywhere in the client,
// and cost a query per page load to produce. That is finding F3.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const season = require("./season");

const URI =
  process.env.SEASON_LADDER_TEST_URI ||
  "mongodb://localhost/twin-tips-test-seasonladder";

const YEAR = 2097;

let reachable = true;

const connect = async () => {
  if (mongoose.connection.readyState === 1) return true;
  try {
    // monitorCommands so the last test can count what the driver actually
    // issued, rather than what the code looks like it issues.
    await mongoose.connect(URI, {
      serverSelectionTimeoutMS: 1500,
      monitorCommands: true,
    });
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

let fixtureId = 970000;

// Round 1 finished a week ago, round 2 starts tomorrow. So the current round is
// 2, the previous is 1, and a ladder for round 1 is what round 2 is judged on.
const seedFixtures = async () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  await db.Fixture.deleteMany({ year: YEAR });

  await db.Fixture.create({
    id: fixtureId++,
    year: YEAR,
    round: 1,
    roundname: "Round 1",
    hteam: "Adelaide",
    ateam: "Melbourne",
    hteamid: 1,
    ateamid: 11,
    hscore: 100,
    ascore: 80,
    winner: "Adelaide",
    complete: 100,
    is_final: 0,
    date: new Date(Date.now() - week),
  });

  await db.Fixture.create({
    id: fixtureId++,
    year: YEAR,
    round: 2,
    roundname: "Round 2",
    hteam: "Carlton",
    ateam: "Essendon",
    hteamid: 3,
    ateamid: 5,
    complete: 0,
    is_final: 0,
    date: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  season.forgetFixtures();
};

// A ladder snapshot for a round: eighteen ranked teams, optionally flagged as
// taken before the round finished.
const seedLadder = async (round, { provisional = false } = {}) => {
  const rows = [];
  for (let i = 1; i <= 18; i += 1) {
    rows.push({
      year: YEAR,
      round,
      id: i,
      name: `Team ${i}`,
      rank: i,
      provisional,
    });
  }
  await db.Standing.insertMany(rows);
};

const wipe = async () => {
  await db.Standing.deleteMany({ year: YEAR });
  season.forgetFixtures();
};

test("the expected ladder exists and is final: nothing to warn about", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  await seedFixtures();
  await wipe();
  await seedLadder(1);

  const state = await season.getSeasonState(YEAR);

  assert.equal(state.ladderRound, 1, "judged on round 1, as it should be");
  assert.equal(state.ladderStale, false);
  assert.equal(state.ladderProvisional, false);
  assert.equal(state.ladderReady, true);
});

// The C1 case. A postponed game no longer holds the ladder back - the snapshot
// is taken anyway and marked - but the split it produces can still move.
test("the expected ladder was taken before its round finished", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  await seedFixtures();
  await wipe();
  await seedLadder(1, { provisional: true });

  const state = await season.getSeasonState(YEAR);

  assert.equal(state.ladderRound, 1, "still the right round");
  assert.equal(state.ladderStale, false, "not stale - the round is correct");
  assert.equal(state.ladderProvisional, true, "but it is provisional");
});

// The field shipped as false regardless of the data before it had a consumer.
// This is the assertion that would have caught that.
test("a provisional ladder is reported, not silently dropped", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  await seedFixtures();
  await wipe();
  await seedLadder(1, { provisional: true });
  const provisional = await season.getSeasonState(YEAR);

  await wipe();
  await seedLadder(1, { provisional: false });
  const final = await season.getSeasonState(YEAR);

  assert.notEqual(
    provisional.ladderProvisional,
    final.ladderProvisional,
    "the two cases must be distinguishable in the payload"
  );
});

test("no snapshot for the previous round is stale, not provisional", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  await seedFixtures();
  await wipe();
  // Nothing for round 1 at all. There is no older round to fall back to here,
  // so the page is told the ladder is not ready rather than given a wrong one.
  const state = await season.getSeasonState(YEAR);

  assert.equal(state.ladderProvisional, false, "no ladder is not a provisional ladder");
  assert.equal(state.ladderRound, null);
});

// The point of F3: the healthy path used to spend two queries on the ladder,
// one to ask whether the snapshot existed and another to read one field off it.
// A findOne answers both. This pins that, because the regression is invisible -
// the payload is identical either way.
test("the healthy path reads the ladder once, not twice", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  await seedFixtures();
  await wipe();
  await seedLadder(1);

  const seen = [];
  const client = mongoose.connection.getClient();
  const watch = (e) => {
    if (
      e.command &&
      (e.command.find === "standings" ||
        e.command.count === "standings" ||
        e.command.aggregate === "standings")
    ) {
      seen.push(e.commandName);
    }
  };

  client.on("commandStarted", watch);
  season.forgetFixtures();
  await season.getSeasonState(YEAR);
  client.off("commandStarted", watch);

  assert.equal(
    seen.length,
    1,
    `expected one standings read on the healthy path, saw ${seen.length}: ${seen.join(", ")}`
  );
});

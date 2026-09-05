// What refreshRound actually writes.
//
// liveScores.test.js covers shouldRefresh, which is pure and decides whether to
// ask Squiggle at all. This covers the other half: the write itself, which had
// nothing on it.
//
// The fields here are the ones that move during a game, and only those. A full
// upsert would rewrite the venue, the date and the team ids on every refresh -
// a lot of churn for a scoreline, and a way for a mid-game feed hiccup to move
// a fixture. So which fields are written is a decision, and this is what holds
// it.
//
// Squiggle is stubbed. Reaching the real API from a test would make the suite
// depend on somebody else's uptime and on a game being on; services/squiggle
// .test.js covers the client itself.
//
// Runs against its own database, which it creates and drops.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const squiggle = require("./squiggle");
const liveScores = require("./liveScores");
const season = require("./season");

const URI =
  process.env.LIVE_WRITE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-livewrite";

const YEAR = 2094;
const GAME_ID = 940001;

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

// Once, after every test in the file: models/index.js registers every model, so
// each reconnect has Mongoose build their indexes, and a build still in flight
// lands after a per-test drop and recreates the database.
const teardown = async () => {
  const original = squiggle.query;
  squiggle.query = original;
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

// A stored fixture partway through, with everything a real one carries - so a
// write that clobbers something it should not leave alone shows up.
const seed = async () => {
  await db.Fixture.deleteMany({ year: YEAR });
  season.forgetFixtures();

  await db.Fixture.create({
    id: GAME_ID,
    year: YEAR,
    round: 5,
    roundname: "Round 5",
    venue: "Adelaide Oval",
    hteam: "Adelaide",
    ateam: "Melbourne",
    hteamid: 1,
    ateamid: 11,
    hscore: 20,
    ascore: 14,
    hgoals: 3,
    hbehinds: 2,
    agoals: 2,
    abehinds: 2,
    complete: 20,
    winner: null,
    timestr: "Q1 18:02",
    is_final: 0,
    date: new Date("2094-05-01T09:20:00.000Z"),
  });
};

// Squiggle's answer for the next call.
const answering = (game) => {
  squiggle.query = async () => ({
    games: [{ id: GAME_ID, year: YEAR, round: 5, ...game }],
  });
};

test("the clock is written along with the score", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seed();

  answering({
    hscore: 50,
    ascore: 30,
    hgoals: 7,
    hbehinds: 8,
    agoals: 4,
    abehinds: 6,
    complete: 40,
    winner: null,
    timestr: "Q2 14:44",
  });

  const result = await liveScores.refreshRound(YEAR, 5);
  assert.equal(result.updated, 1);

  const stored = await db.Fixture.findOne({ id: GAME_ID });
  assert.equal(stored.timestr, "Q2 14:44", "the clock moved with the score");
  assert.equal(stored.hscore, 50);
  assert.equal(stored.complete, 40);
});

// The point of writing it here rather than leaving it to the hourly sync: this
// is the refresh that runs while a game is on, and a quarter-time updated once
// an hour would name a quarter that finished forty minutes ago.
test("a later refresh moves the clock on", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seed();

  answering({ hscore: 50, ascore: 30, complete: 40, timestr: "Q2 14:44" });
  await liveScores.refreshRound(YEAR, 5);

  answering({ hscore: 57, ascore: 30, complete: 47, timestr: "Q2 21:10" });
  await liveScores.refreshRound(YEAR, 5);

  const stored = await db.Fixture.findOne({ id: GAME_ID });
  assert.equal(stored.timestr, "Q2 21:10");
});

test("full time is stored as Squiggle sends it", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seed();

  answering({
    hscore: 100,
    ascore: 80,
    complete: 100,
    winner: "Adelaide",
    timestr: "Full Time",
  });

  await liveScores.refreshRound(YEAR, 5);

  const stored = await db.Fixture.findOne({ id: GAME_ID });
  assert.equal(stored.timestr, "Full Time");
  assert.equal(stored.complete, 100);
  assert.equal(stored.winner, "Adelaide");
});

// The reason the write names its fields rather than spreading the payload. A
// mid-game feed hiccup should not be able to move a fixture to another ground
// or another day.
test("a refresh cannot move the venue, the date or the teams", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seed();

  answering({
    hscore: 50,
    ascore: 30,
    complete: 40,
    timestr: "Q2 14:44",
    // All wrong, and all ignored.
    venue: "Somewhere Else",
    hteam: "Carlton",
    ateam: "Essendon",
    date: "2094-12-25 19:20:00",
    round: 99,
  });

  await liveScores.refreshRound(YEAR, 5);

  const stored = await db.Fixture.findOne({ id: GAME_ID });
  assert.equal(stored.venue, "Adelaide Oval");
  assert.equal(stored.hteam, "Adelaide");
  assert.equal(stored.ateam, "Melbourne");
  assert.equal(stored.round, 5);
  assert.equal(
    stored.date.toISOString(),
    "2094-05-01T09:20:00.000Z",
    "the kick-off is not the live refresh's to change"
  );
});

test("a response with nothing usable in it writes nothing", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seed();

  squiggle.query = async () => ({ games: [] });
  const result = await liveScores.refreshRound(YEAR, 5);

  assert.equal(result.updated, 0);

  const stored = await db.Fixture.findOne({ id: GAME_ID });
  assert.equal(stored.timestr, "Q1 18:02", "the stored clock is left alone");
  assert.equal(stored.hscore, 20);
});

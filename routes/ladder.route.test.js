// Route tests for the site ladder's round.
//
//   npm test
//
// The service decides what a round looks like; this route decides whether
// anybody may see it yet, and that decision is the reason the file exists.
// Tips are private until the round bounces, and until now that was enforced by
// the dashboard declining to draw the cells while every route behind it handed
// over the selections regardless. A page-level test cannot see that, because it
// stubs the API module: it proves the table draws what the route sends and says
// nothing at all about what the route sends.
//
// So the assertions here are mostly about what is absent from a response.
//
// Shaped like routes/tips.route.test.js: the real router on an app of our own,
// passport stood in for, an ephemeral port, and its own database. The clock is
// not moved - rounds are seeded relative to now, one whose first game is two
// days away and one that bounced a minute ago, which is both closer to the real
// thing and free of devClock's load-time offset.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const season = require("../services/season");

const URI =
  process.env.LADDER_ROUTE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-ladderroute";

const YEAR = 2090;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Round 1 is played. Round 2 is the one being tipped, and `firstBounceIn`
// decides whether it has started.
const seed = async (firstBounceIn) => {
  await db.Fixture.deleteMany({});
  await db.Tip.deleteMany({});
  season.forgetFixtures();

  const now = Date.now();

  await db.Fixture.create([
    {
      id: 1, year: YEAR, round: 1, roundname: "Round 1", is_final: 0,
      date: new Date(now - 3 * DAY), complete: 100,
      hteam: "Carlton", hteamid: 3, ateam: "Melbourne", ateamid: 11,
      hscore: 90, ascore: 80, winner: "Carlton", winnerteamid: 3,
    },
    {
      id: 2, year: YEAR, round: 2, roundname: "Round 2", is_final: 0,
      date: new Date(now + firstBounceIn), complete: 0,
      hteam: "Adelaide", hteamid: 1, ateam: "Melbourne", ateamid: 11,
    },
    {
      id: 3, year: YEAR, round: 2, roundname: "Round 2", is_final: 0,
      date: new Date(now + 3 * DAY), complete: 0,
      hteam: "Carlton", hteamid: 3, ateam: "Richmond", ateamid: 14,
    },
  ]);
};

test("GET /api/ladder/global/rounds/:round", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening - skipping the route tests");
    return;
  }

  assert.match(
    mongoose.connection.name,
    /test/,
    `refusing to run against database "${mongoose.connection.name}"`
  );

  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;

    await mongoose.disconnect();

    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

  const ann = await db.User.create({
    firstName: "Ann", lastName: "Tipper", username: "ann_ladder",
    email: "ann_ladder@local.test", password: "x", favTeam: 1,
  });

  let signedIn = true;
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = () => signedIn;
    if (signedIn) req.user = { id: String(ann._id), admin: false };
    next();
  });
  app.use("/api/ladder", require("./ladder"));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const get = async (path) => {
    const res = await fetch(`${base}/api/ladder/${path}`);
    let json = null;
    try {
      json = JSON.parse(await res.text());
    } catch {
      /* not json */
    }
    return { status: res.status, body: json, raw: JSON.stringify(json) };
  };

  // A tip in the round being played, with a distinctive team so it can be
  // looked for anywhere in the response rather than in the field it belongs to.
  const tipRound2 = () =>
    db.Tip.create({
      user: ann._id, season: YEAR, round: 2,
      topEightSelection: "Adelaide", bottomTenSelection: "Richmond",
      marginTopEight: 27, marginBottomTen: 0,
    });

  // --- before the bounce -------------------------------------------------

  await t.test("a round still open sends no picks at all", async () => {
    await seed(2 * DAY);
    await tipRound2();

    const { status, raw, body } = await get(`global/rounds/2?season=${YEAR}`);

    assert.equal(status, 200);
    // A team name is distinctive enough to look for in the whole response.
    // A margin is not - "27" is two digits that turn up inside an ObjectId
    // often enough that this test passed alone and failed in a full run - so
    // the margins are checked as the fields they are.
    assert.equal(raw.includes("Adelaide"), false, "the pick must not be in the response");
    assert.equal(raw.includes("Richmond"), false, "nor the other one");

    for (const row of body.standings) {
      assert.equal(row.topEightSelection, null);
      assert.equal(row.bottomTenSelection, null);
      assert.equal(row.marginTopEight, null);
      assert.equal(row.marginBottomTen, null);
    }
  });

  // Who has entered is not the secret, and it is what makes a reminder
  // possible. What they picked is.
  await t.test("but it does say who has entered", async () => {
    await seed(2 * DAY);
    await tipRound2();

    const { body } = await get(`global/rounds/2?season=${YEAR}`);
    const row = body.standings.find((s) => s.username === "ann_ladder");

    assert.equal(row.status, "entered");
    assert.equal(body.entrants, 1);
  });

  // --- after it ----------------------------------------------------------

  await t.test("once the round has bounced the picks are public", async () => {
    await seed(-MINUTE);
    await tipRound2();

    const { body, raw } = await get(`global/rounds/2?season=${YEAR}`);
    const row = body.standings.find((s) => s.username === "ann_ladder");

    assert.equal(row.topEightSelection, "Adelaide");
    assert.equal(row.marginTopEight, 27);
    assert.ok(raw.includes("Richmond"));
  });

  // A round already gone is settled whatever the round in progress is doing.
  await t.test("a round already played is public while a later one is open", async () => {
    await seed(2 * DAY);
    await db.Tip.create({
      user: ann._id, season: YEAR, round: 1,
      topEightSelection: "Carlton", bottomTenSelection: "Melbourne",
      marginTopEight: 10, marginBottomTen: 0,
    });

    const { body } = await get(`global/rounds/1?season=${YEAR}`);
    const row = body.standings.find((s) => s.username === "ann_ladder");

    assert.equal(row.topEightSelection, "Carlton");
  });

  // --- the rest of the route ---------------------------------------------

  await t.test("the shape a league's round comes back in", async () => {
    await seed(-MINUTE);
    await tipRound2();

    const { body } = await get(`global/rounds/2?season=${YEAR}`);

    assert.equal(body.pays, true, "there is a pool every round");
    assert.equal(body.buyIn, 0, "and no buy-in to price it in");
    assert.equal(body.round, 2);
    assert.equal(body.season, YEAR);
    assert.ok(Array.isArray(body.standings));
    assert.ok(Array.isArray(body.winners));
  });

  await t.test("round 0 is a round", async () => {
    await seed(2 * DAY);
    assert.equal((await get(`global/rounds/0?season=${YEAR}`)).status, 200);
  });

  await t.test("a round that is not a number is refused", async () => {
    assert.equal((await get(`global/rounds/nonsense?season=${YEAR}`)).status, 400);
    assert.equal((await get(`global/rounds/-1?season=${YEAR}`)).status, 400);
  });

  await t.test("signed out, the route refuses", async () => {
    await seed(-MINUTE);
    signedIn = false;
    const { status } = await get(`global/rounds/2?season=${YEAR}`);
    signedIn = true;

    assert.equal(status, 401);
  });

  // The season table beside it, which this route sits next to and must not
  // have broken by being declared above it.
  await t.test("the season ladder still answers", async () => {
    await seed(-MINUTE);
    const { status, body } = await get(`global?season=${YEAR}`);

    assert.equal(status, 200);
    assert.ok(Array.isArray(body.standings));
  });

  server.close();
});

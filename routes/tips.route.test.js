// Route tests for the tipping deadline.
//
//   npm test
//
// The deadline is the one rule of this competition that cannot be allowed to
// fail quietly. It was enforced in the browser only for a long time: a tip
// could be posted after the first bounce, with results already known, and the
// only thing in the way was a disabled button. That is now checked on the
// server, and this is what holds it there.
//
// Everything here goes through the real route - the same handler server.js
// mounts, with the real season service, the real ladder lookup and the real
// tip rules behind it. Only two things are stood in for: the session, because
// passport is library code and is exercised by signing in for real elsewhere,
// and the listener, which binds an ephemeral port rather than taking 3001.
//
// The clock is not moved. Rounds are seeded relative to now - a round whose
// first game is two days away, or one whose first game bounced a minute ago -
// which is both closer to the real thing and free of devClock, whose offset is
// fixed when the module loads and so cannot vary within a file.
//
// Runs against its own database, which it creates and drops. The name is
// specific to this file: the test runner gives each file its own process but
// not its own database, so two files sharing a name drop each other's fixtures
// mid-run.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const season = require("../services/season");

const URI = process.env.ROUTE_TEST_URI || "mongodb://localhost/twin-tips-test-routes";
const YEAR = 2098;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const NAMES = {
  1: "Adelaide", 3: "Carlton", 11: "Melbourne", 14: "Richmond",
};

// A season of two rounds. Round 1 is played and has a ladder; round 2 is the
// one being tipped, and `firstBounceIn` decides whether it has started.
const seed = async (firstBounceIn) => {
  await db.Fixture.deleteMany({});
  await db.Standing.deleteMany({});
  await db.Tip.deleteMany({});

  // The season service holds the fixture list briefly, so anything writing
  // fixtures directly has to say so - the two production writers do it for the
  // same reason. Without this, moving the bounce between cases has no effect
  // and the deadline tests all read whatever the first case seeded.
  season.forgetFixtures();

  const now = Date.now();

  await db.Fixture.create([
    // Round 1: finished, three days ago.
    {
      id: 1, year: YEAR, round: 1, roundname: "Round 1", is_final: 0,
      date: new Date(now - 3 * DAY), complete: 100,
      hteam: "Carlton", hteamid: 3, ateam: "Melbourne", ateamid: 11,
      hscore: 90, ascore: 80, winner: "Carlton", winnerteamid: 3,
    },
    // Round 2, first game - the one the deadline hangs on.
    {
      id: 2, year: YEAR, round: 2, roundname: "Round 2", is_final: 0,
      date: new Date(now + firstBounceIn), complete: 0,
      hteam: "Adelaide", hteamid: 1, ateam: "Melbourne", ateamid: 11,
    },
    // Round 2, a later game. Keeps the season from reading as finished, and is
    // what makes "the first game has started but others have not" a real case.
    {
      id: 3, year: YEAR, round: 2, roundname: "Round 2", is_final: 0,
      date: new Date(now + 3 * DAY), complete: 0,
      hteam: "Carlton", hteamid: 3, ateam: "Richmond", ateamid: 14,
    },
  ]);

  // The ladder after round 1, which is what round 2 is judged against.
  // rank = team id, so 1 and 3 are top eight and 11 and 14 are bottom ten.
  await db.Standing.create(
    Object.entries(NAMES).map(([id, name]) => ({
      year: YEAR, round: 1, id: Number(id), name, rank: Number(id),
    }))
  );
};

// A legal tip: Adelaide is top-8 and in the first game, Richmond is bottom-10
// and in the second, so they are from different games.
const LEGAL = {
  round: 2,
  season: YEAR,
  topEightSelection: "Adelaide",
  bottomTenSelection: "Richmond",
  marginTopEight: 12,
  marginBottomTen: 0,
};

test("POST /api/tips deadline", async (t) => {
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

  const user = await db.User.create({
    firstName: "Route", lastName: "Test", username: "route_test",
    email: "route_test@local.test", password: "x", favTeam: 1,
  });

  // The real routes, on an app of our own. requireAuth asks passport for
  // isAuthenticated(), so that is what gets stood in for - and `signedIn` is
  // flipped per request so the unauthenticated case is the same route.
  let signedIn = true;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => signedIn;
    if (signedIn) req.user = { id: String(user._id), admin: false };
    next();
  });
  require("./api-routes.js")(app);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = async (body) => {
    const res = await fetch(`${base}/api/tips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = JSON.parse(await res.text()); } catch { /* not json */ }
    return { status: res.status, message: json && json.message };
  };

  const tipCount = () => db.Tip.countDocuments({ season: YEAR, round: 2 });

  // --- the window is open ------------------------------------------------

  await t.test("a legal tip is accepted while the round is still to come", async () => {
    await seed(2 * DAY);
    const res = await post(LEGAL);
    assert.equal(res.status, 200, res.message);
    assert.equal(await tipCount(), 1);
  });

  await t.test("a tip can be changed while the window is open", async () => {
    await seed(2 * DAY);
    await post(LEGAL);
    const res = await post({ ...LEGAL, topEightSelection: "Carlton", bottomTenSelection: "Melbourne" });
    assert.equal(res.status, 200, res.message);
    assert.equal(await tipCount(), 1, "changing a tip must not add a second");

    const stored = await db.Tip.findOne({ season: YEAR, round: 2 });
    assert.equal(stored.topEightSelection, "Carlton");
  });

  // One minute before the bounce is still open. This is the case people
  // actually hit - the tip that goes in as the teams run out.
  await t.test("a minute before the first bounce is still open", async () => {
    await seed(1 * MINUTE);
    const res = await post(LEGAL);
    assert.equal(res.status, 200, res.message);
    assert.equal(await tipCount(), 1);
  });

  // --- the window is shut ------------------------------------------------

  await t.test("a minute after the first bounce is refused", async () => {
    await seed(-1 * MINUTE);
    const res = await post(LEGAL);
    assert.equal(res.status, 403);
    assert.match(res.message, /started|locked/i);
    assert.equal(await tipCount(), 0, "nothing may be written after the bounce");
  });

  // The whole round locks at the first bounce, not game by game. Two teams in
  // this tip are in the later game, which has not been played - and it still
  // must not be tippable, or you could pick after seeing the first result.
  await t.test("later games in the round do not stay tippable", async () => {
    await seed(-1 * MINUTE);
    const res = await post({
      ...LEGAL,
      topEightSelection: "Carlton",
      bottomTenSelection: "Richmond",
    });
    assert.equal(res.status, 403);
    assert.equal(await tipCount(), 0);
  });

  // A tip already in before the bounce cannot be edited after it.
  await t.test("an existing tip cannot be changed after the bounce", async () => {
    await seed(2 * DAY);
    await post(LEGAL);

    // The round starts. Written directly rather than through seed(), so this
    // has to drop the cached fixture list itself - exactly as liveScores and
    // the sync do after their own writes.
    await db.Fixture.updateOne({ id: 2 }, { $set: { date: new Date(Date.now() - MINUTE) } });
    season.forgetFixtures();

    const res = await post({ ...LEGAL, topEightSelection: "Carlton", bottomTenSelection: "Melbourne" });
    assert.equal(res.status, 403);

    const stored = await db.Tip.findOne({ season: YEAR, round: 2 });
    assert.equal(stored.topEightSelection, "Adelaide", "the original tip must stand");
  });

  // --- the round being tipped -------------------------------------------

  await t.test("a round that has already been played is refused", async () => {
    await seed(2 * DAY);
    const res = await post({ ...LEGAL, round: 1 });
    assert.equal(res.status, 403);
    assert.match(res.message, /Round 2/);
    assert.equal(await db.Tip.countDocuments({ season: YEAR, round: 1 }), 0);
  });

  await t.test("a round that does not exist yet is refused", async () => {
    await seed(2 * DAY);
    const res = await post({ ...LEGAL, round: 9 });
    assert.equal(res.status, 403);
  });

  // --- who the tip belongs to -------------------------------------------

  await t.test("the tip belongs to the session, not to the body", async () => {
    await seed(2 * DAY);
    const someoneElse = new mongoose.Types.ObjectId();
    const res = await post({ ...LEGAL, user: String(someoneElse) });

    assert.equal(res.status, 200, res.message);
    const stored = await db.Tip.findOne({ season: YEAR, round: 2 });
    assert.equal(String(stored.user), String(user._id));
    assert.notEqual(String(stored.user), String(someoneElse));
  });

  await t.test("signed out, the route refuses before it reads anything", async () => {
    await seed(2 * DAY);
    signedIn = false;
    const res = await post(LEGAL);
    signedIn = true;

    assert.equal(res.status, 401);
    assert.equal(await tipCount(), 0);
  });

  // --- leave nothing behind ---------------------------------------------

  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// Route tests for the three ways a round's tips leave the server.
//
//   npm test
//
// Tips are private until the round bounces. That was enforced by the dashboard
// declining to draw the cells, while every route behind it handed over the
// selections regardless - the same shape the tipping deadline had before it
// moved to the server, and the same worthless kind of rule. The dashboard even
// fetches this before the bounce, so the tips were already sitting in the
// browser of anybody who opened the page.
//
// It matters more here than in ordinary tipping. One top-eight team and one
// bottom-ten team, from different games, neither repeating last round's pick,
// leaves few enough legal tips that reading a handful of people's is close to
// reading everybody's.
//
// The three routes:
//
//   POST /api/roundResult            everybody's tips, for the dashboard
//   GET  /api/leagues/rounds/:round  the same round in each of my leagues
//   GET  /api/leagues/:slug/rounds/:round   one league's round in full
//
// A page test cannot see any of this: it stubs the API module, so it proves the
// table draws what the route sends and says nothing about what the route sends.
// So the assertions here are mostly about what is absent from a response.
//
// Shaped like routes/tips.route.test.js: real routers on an app of our own,
// passport stood in for, an ephemeral port, its own database. The clock is not
// moved - the round is seeded relative to now, with its first game either two
// days away or a minute past.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const season = require("../services/season");

const URI =
  process.env.ROUNDS_ROUTE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-roundsroute";

const YEAR = 2089;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// The pick that must not escape. Distinctive enough to look for anywhere in a
// response rather than in the field it belongs to.
const SECRET_TOP = "Adelaide";
const SECRET_BOTTOM = "Richmond";

// Round 1 played, round 2 the one being tipped. firstBounceIn decides whether
// round 2 has started.
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

test("a round's tips leaving the server", async (t) => {
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
    firstName: "Ann", lastName: "One", username: "ann_rounds",
    email: "ann_rounds@local.test", password: "x", favTeam: 1,
  });
  const bob = await db.User.create({
    firstName: "Bob", lastName: "Two", username: "bob_rounds",
    email: "bob_rounds@local.test", password: "x", favTeam: 1,
  });

  // A weekly league with both of them in it, so the round has a pool and two
  // entrants to split it between.
  const league = await db.League.create({
    name: "Route Pool", slug: "route-pool", type: "weekly",
    joinCode: "TWIN-RT01", admin: ann._id, buyIn: 5,
    createdSeason: YEAR, startRound: 1,
  });

  for (const user of [ann, bob]) {
    await db.LeagueMembership.create({
      league: league._id, user: user._id,
      joinedAtRound: 1, joinedAtSeason: YEAR,
    });
  }

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: String(ann._id), admin: false };
    next();
  });
  require("./api-routes.js")(app);
  app.use("/api/leagues", require("./leagues"));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const read = async (res) => {
    let json = null;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, body: json, raw: text };
  };

  const get = (path) => fetch(`${base}${path}`).then(read);
  const post = (path, body) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(read);

  // Both of them tip round 2. Unscored, which is what a tip looks like between
  // the deadline and the games.
  const tipRound2 = async () => {
    for (const user of [ann, bob]) {
      await db.Tip.create({
        user: user._id, season: YEAR, round: 2,
        topEightSelection: SECRET_TOP, bottomTenSelection: SECRET_BOTTOM,
        marginTopEight: 29, marginBottomTen: 0,
      });
    }
  };

  // The three ways out, so each case can ask all of them the same question.
  const everyRoute = async () => ({
    dashboard: await post("/api/roundResult", { round: 2, season: YEAR }),
    myLeagues: await get(`/api/leagues/rounds/2?season=${YEAR}`),
    oneLeague: await get(`/api/leagues/route-pool/rounds/2?season=${YEAR}`),
  });

  // --- before the bounce -------------------------------------------------

  await t.test("no route gives up a pick", async () => {
    await seed(2 * DAY);
    await tipRound2();

    for (const [name, res] of Object.entries(await everyRoute())) {
      assert.equal(res.status, 200, name);
      assert.equal(
        res.raw.includes(SECRET_TOP),
        false,
        `${name} sent the top-eight pick`
      );
      assert.equal(
        res.raw.includes(SECRET_BOTTOM),
        false,
        `${name} sent the bottom-ten pick`
      );
    }
  });

  await t.test("nor a margin", async () => {
    await seed(2 * DAY);
    await tipRound2();

    const { dashboard, oneLeague } = await everyRoute();

    for (const row of dashboard.body) {
      assert.equal(row.marginTopEight, null);
      assert.equal(row.correctTips, null);
    }
    for (const row of oneLeague.body.standings) {
      assert.equal(row.marginTopEight, null);
      assert.equal(row.marginError, null);
    }
  });

  // Who has entered is not the secret - the dashboard says so already, and it
  // is what a reminder would be built on.
  await t.test("but who has entered is still said", async () => {
    await seed(2 * DAY);
    await tipRound2();

    const { dashboard, oneLeague } = await everyRoute();

    assert.equal(dashboard.body.length, 2, "both rows are there");
    assert.equal(oneLeague.body.entrants, 2);
    assert.equal(
      oneLeague.body.standings.every((s) => s.status === "entered"),
      true
    );
  });

  // The half that is not about privacy. Unscored, everybody is level on
  // nothing, and pickWinners left to itself returns the lot.
  await t.test("and nobody has won a round nobody has played", async () => {
    await seed(2 * DAY);
    await tipRound2();

    const { oneLeague, myLeagues } = await everyRoute();

    assert.deepEqual(oneLeague.body.winners, []);
    assert.equal(oneLeague.body.share, 0);
    for (const row of oneLeague.body.standings) {
      assert.equal(row.won, false);
      assert.equal(row.winnings, 0);
      assert.equal(row.rank, null);
    }

    const mine = myLeagues.body.leagues.find((l) => l.league === "route-pool");
    assert.deepEqual(mine.winners, []);
  });

  // --- after it ----------------------------------------------------------

  await t.test("once it has bounced every route shows the picks", async () => {
    await seed(-MINUTE);
    await tipRound2();

    for (const [name, res] of Object.entries(await everyRoute())) {
      assert.equal(
        res.raw.includes(SECRET_TOP),
        true,
        `${name} withheld a pick from a round already under way`
      );
    }
  });

  // A round already gone is settled whatever the round in progress is doing.
  await t.test("a played round stays public while a later one is open", async () => {
    await seed(2 * DAY);
    await db.Tip.create({
      user: ann._id, season: YEAR, round: 1,
      topEightSelection: "Carlton", bottomTenSelection: "Melbourne",
      marginTopEight: 10, marginBottomTen: 0,
      correctTips: 1, topEightCorrect: 1, topEightDifference: 0,
    });

    const dashboard = await post("/api/roundResult", { round: 1, season: YEAR });
    const oneLeague = await get(`/api/leagues/route-pool/rounds/1?season=${YEAR}`);

    assert.equal(dashboard.raw.includes("Carlton"), true);
    assert.equal(
      oneLeague.body.standings.find((s) => s.username === "ann_rounds")
        .topEightSelection,
      "Carlton"
    );
  });

  // Nobody has tipped it, so there is nothing to hide - but a round in the
  // future must not be readable even when somebody has got in early.
  await t.test("a round that has not come round yet shows nothing", async () => {
    await seed(2 * DAY);
    await db.Tip.create({
      user: ann._id, season: YEAR, round: 3,
      topEightSelection: SECRET_TOP, bottomTenSelection: SECRET_BOTTOM,
      marginTopEight: 41, marginBottomTen: 0,
    });

    const dashboard = await post("/api/roundResult", { round: 3, season: YEAR });

    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.raw.includes(SECRET_TOP), false);
    assert.equal(dashboard.body.length, 1, "the entry is still listed");
  });

  server.close();
});

// The routes the Tips page is built from, and the one that changes your team.
//
// Found by measuring the server suite's coverage. The round's fixtures with
// their ladder positions - which decide which half of the ladder each side is
// in, and so what can be picked - had no test. Nor did most of what the tip
// route refuses: only its deadline was tried (tips.route.test.js), and no test
// showed the route turning away a tip that breaks the rules, which are tested
// on their own in services/tipRules.test.js but not as the route uses them.
//
// The real routes against a real MongoDB, with the session stood in for as in
// tips.route.test.js: what is under test is what each route does for a
// signed-in player, and that it does nothing for anyone else.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const season = require("../services/season");

const URI =
  process.env.ROUND_DATA_TEST_URI ||
  "mongodb://localhost/twin-tips-test-round-data";
const YEAR = 2097;
const DAY = 24 * 60 * 60 * 1000;

// The ladder after round 1, which round 2 is tipped against: a rank each, and
// eighth is the last of the top half.
const LADDER = { 1: "Adelaide", 3: "Carlton", 11: "Melbourne", 14: "Richmond" };

// Round 1 played, round 2 open for two more days.
const seed = async () => {
  await Promise.all([
    db.Fixture.deleteMany({}),
    db.Standing.deleteMany({}),
    db.Tip.deleteMany({}),
    db.Team.deleteMany({}),
  ]);
  season.forgetFixtures();
  const now = Date.now();
  const game = (id, round, date, home, away, over = {}) => ({
    id,
    year: YEAR,
    round,
    roundname: `Round ${round}`,
    is_final: 0,
    date: new Date(date),
    complete: 0,
    hteam: LADDER[home],
    hteamid: home,
    ateam: LADDER[away],
    ateamid: away,
    ...over,
  });

  await db.Fixture.create([
    game(1, 1, now - 3 * DAY, 3, 11, { complete: 100, hscore: 90, ascore: 80 }),
    // Created out of order: the route sorts by the bounce.
    game(3, 2, now + 3 * DAY, 3, 14),
    game(2, 2, now + 2 * DAY, 1, 11),
    // Another season's round 2, which no request for this one should reach.
    game(9, 2, now - 365 * DAY, 1, 3, { year: YEAR - 1, complete: 100 }),
  ]);
  await db.Standing.create(
    Object.entries(LADDER).map(([id, name]) => ({
      year: YEAR,
      round: 1,
      id: Number(id),
      name,
      rank: Number(id),
    }))
  );
  // Stored out of name order, so the order they come back in is the route's.
  await db.Team.create(
    Object.entries(LADDER)
      .reverse()
      .map(([id, name]) => ({
        id: Number(id),
        name,
        abbrev: name.slice(0, 3).toUpperCase(),
      }))
  );
};

// The tip the rules allow for round 2: Adelaide (1st) and Richmond (14th),
// from different games, with one margin.
const LEGAL = {
  round: 2,
  season: YEAR,
  topEightSelection: "Adelaide",
  bottomTenSelection: "Richmond",
  marginTopEight: 12,
  marginBottomTen: 0,
};

test("the round's data", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const user = await db.User.create({
    firstName: "Round",
    lastName: "Data",
    username: "round_data",
    email: "round_data@local.test",
    password: "x",
  });

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
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const tip = (over = {}) => call("POST", "/api/tips", { ...LEGAL, ...over });

  await seed();

  await t.test("entering a tip", async (t) => {
    // The route's own checks come before the season is read, so these are
    // refused whatever the round.
    await t.test("needs a round", async () => {
      const res = await tip({ round: "next" });
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "A valid round is required.");
    });

    await t.test("and a team from each group", async () => {
      const noTop = await tip({ topEightSelection: "" });
      const noBottom = await tip({ bottomTenSelection: undefined });

      assert.equal(noTop.status, 400);
      assert.equal(noBottom.status, 400);
      assert.equal(noTop.body.message, "Select a team for each group.");
      assert.equal(noBottom.body.message, "Select a team for each group.");
    });

    // A margin is a whole number of points, from 1 to 200, on one game.
    await t.test("a margin is a sensible whole number", async () => {
      const cases = [
        ["lots", "The top 8 margin must be a number."],
        [-5, "A margin cannot be negative."],
        [7.5, "A margin is a whole number of points."],
        [201, "A margin of 201 is too big - 200 at most."],
      ];
      for (const [margin, message] of cases) {
        const res = await tip({ marginTopEight: margin });
        assert.equal(res.status, 400, String(margin));
        assert.equal(res.body.message, message);
      }

      const bottom = await tip({
        marginTopEight: 0,
        marginBottomTen: "lots",
      });
      assert.equal(
        bottom.body.message,
        "The bottom 10 margin must be a number."
      );
      assert.equal((await tip({ marginTopEight: 200 })).status, 200);
    });

    await t.test("on one game, not none", async () => {
      const res = await tip({ marginTopEight: 0, marginBottomTen: "" });

      assert.equal(res.status, 400);
      assert.equal(
        res.body.message,
        "Enter a margin for one of the two games."
      );
    });

    await t.test("and not both", async () => {
      const res = await tip({ marginTopEight: 10, marginBottomTen: 10 });

      assert.equal(res.status, 400);
      assert.equal(
        res.body.message,
        "Enter a margin for one game only, not both."
      );
    });

    // The competition's rules, as the route applies them.
    await t.test("refuses a team from the wrong half", async () => {
      await db.Tip.deleteMany({});
      const res = await tip({
        topEightSelection: "Richmond",
        bottomTenSelection: "Melbourne",
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Richmond is not in the top 8.");
      assert.equal(await db.Tip.countDocuments(), 0);
    });

    await t.test("and last round's team", async () => {
      await db.Tip.deleteMany({});
      await db.Tip.create({
        user: user._id,
        season: YEAR,
        round: 1,
        topEightSelection: "Adelaide",
        bottomTenSelection: "Melbourne",
      });

      const res = await tip();

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "You picked Adelaide last round.");
      assert.equal(await db.Tip.countDocuments({ round: 2 }), 0);
    });

    await t.test("and takes one that keeps them", async () => {
      await db.Tip.deleteMany({});
      const res = await tip();

      assert.equal(res.status, 200);
      const saved = await db.Tip.findOne({ round: 2 });
      assert.deepEqual(
        [
          saved.topEightSelection,
          saved.bottomTenSelection,
          saved.marginTopEight,
        ],
        ["Adelaide", "Richmond", 12]
      );
    });
  });

  await t.test("a round's fixtures", async (t) => {
    const round = (body) => call("POST", "/api/detailsRound", body);

    await t.test("are that round's, in the order they are played", async () => {
      const res = await round({ year: YEAR, round: 2 });

      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((g) => g.id),
        [2, 3]
      );
    });

    // Each side's place on the ladder the round is tipped against - which is
    // what decides the half it can be picked from.
    await t.test("carry each side's place on the ladder", async () => {
      const res = await round({ year: YEAR, round: 2 });
      const first = res.body[0];

      assert.equal(first["home-team-standing"][0].rank, 1);
      assert.equal(first["away-team-standing"][0].rank, 11);
      assert.equal(res.body[1]["away-team-standing"][0].rank, 14);
    });

    // A side the ladder has no row for gets an empty list, the shape the
    // page reads, rather than a missing field.
    await t.test("and an empty place where the ladder has none", async () => {
      await db.Standing.deleteOne({ year: YEAR, id: 14 });
      const res = await round({ year: YEAR, round: 2 });
      await seed();

      assert.deepEqual(res.body[1]["away-team-standing"], []);
    });

    // The body is read field by field, not handed to the query, so an
    // operator is not a filter.
    await t.test("an operator for a year is not a query", async () => {
      const res = await round({ year: { $gt: 0 }, round: 2 });

      assert.equal(res.status, 200);
      assert.ok(res.body.every((g) => g.year === YEAR && g.round === 2));
    });
  });

  await t.test("the ladder for a round", async (t) => {
    // Round 2 is played against the ladder after round 1.
    await t.test("defaults to the round being played", async () => {
      const res = await call("GET", `/api/standingsDb?year=${YEAR}`);

      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((r) => [r.name, r.rank, r.round]),
        [
          ["Adelaide", 1, 1],
          ["Carlton", 3, 1],
          ["Melbourne", 11, 1],
          ["Richmond", 14, 1],
        ]
      );
    });

    // Round 1 is played against the ladder before it, and this season has
    // none - so asking for round 1 is not the default answered again.
    await t.test("or the round asked for", async () => {
      const second = await call("GET", `/api/standingsDb?year=${YEAR}&round=2`);
      const first = await call("GET", `/api/standingsDb?year=${YEAR}&round=1`);

      assert.equal(second.body.length, 4);
      assert.equal(first.status, 200);
      assert.deepEqual(first.body, []);
    });
  });

  await t.test("the clubs come back in name order", async () => {
    const res = await call("GET", "/api/teams");

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((team) => team.name),
      ["Adelaide", "Carlton", "Melbourne", "Richmond"]
    );
  });

  await t.test("your team", async (t) => {
    const choose = (favTeam) => call("PATCH", "/api/users/me", { favTeam });

    await t.test("is a club's number", async () => {
      const res = await choose("Carlton");

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Choose a team.");
    });

    await t.test("of a club there is", async () => {
      const res = await choose(99);

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "That is not a team.");
      assert.equal((await db.User.findById(user._id)).favTeam, undefined);
    });

    await t.test("and is kept, named back to you", async () => {
      const res = await choose("3");

      assert.equal(res.status, 200);
      assert.equal(res.body.message, "Favourite team set to Carlton.");
      assert.equal((await db.User.findById(user._id)).favTeam, 3);
    });

    // Only the team: the update names its field rather than taking the body,
    // which is how register once let a client make itself admin.
    await t.test("and nothing else rides along", async () => {
      const res = await call("PATCH", "/api/users/me", {
        favTeam: 1,
        admin: true,
        username: "someone_else",
      });

      assert.equal(res.status, 200);
      const saved = await db.User.findById(user._id);
      assert.equal(saved.admin, false);
      assert.equal(saved.username, "round_data");
    });
  });

  // None of it for anyone not signed in.
  await t.test("signed out, every one of these is refused", async () => {
    signedIn = false;
    t.after(() => {
      signedIn = true;
    });

    const answers = await Promise.all([
      tip(),
      call("POST", "/api/detailsRound", { year: YEAR, round: 2 }),
      call("GET", `/api/standingsDb?year=${YEAR}`),
      call("GET", "/api/teams"),
      call("PATCH", "/api/users/me", { favTeam: 1 }),
    ]);

    assert.deepEqual(
      answers.map((a) => a.status),
      [401, 401, 401, 401, 401]
    );
  });
});

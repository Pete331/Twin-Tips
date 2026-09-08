// Route tests for the stored prices and the line.
//
//   npm test
//
// This route is a projection and nothing else, which is exactly why it needs a
// test of its own. Everything it hands over is chosen by one string of field
// names, and a field left out of that string does not fail, warn, or look
// wrong anywhere on the server - the page simply stops showing something. The
// component and page tests cannot see it either: they stub the API module, so
// they prove the card draws what the route sends and say nothing about what
// the route sends.
//
// The line is the reason that gap is worth closing now. It is one more name in
// DISPLAY_FIELDS, and the failure mode of forgetting it is a card that quietly
// never mentions a handicap again.
//
// Shaped like routes/tips.route.test.js: the real router on an app of our own,
// passport stood in for, an ephemeral port, and its own database - named for
// this file, because the runner gives each file a process but not a database.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");

const URI = process.env.ODDS_ROUTE_TEST_URI || "mongodb://localhost/twin-tips-test-odds-route";
const YEAR = 2097;

// Adelaide 1 at home to Melbourne 11, with Adelaide giving 21.5 starts.
//
// Every field the sync writes, including the raw quotes - the point of storing
// those is that they never reach the browser, and this is what checks it.
const ROW = {
  game: 5001,
  year: YEAR,
  round: 12,
  homeTeamId: 1,
  awayTeamId: 11,
  home: {
    average: 1.44,
    best: 1.46,
    bookmaker: "SportsBet",
    count: 7,
    low: 1.42,
    high: 1.46,
    quotes: [{ bookmaker: "sportsbet", title: "SportsBet", price: 1.46 }],
  },
  away: {
    average: 2.8,
    best: 2.9,
    bookmaker: "TAB",
    count: 7,
    low: 2.75,
    high: 2.9,
    quotes: [{ bookmaker: "tab", title: "TAB", price: 2.9 }],
  },
  line: {
    point: -21.5,
    count: 7,
    low: -21.5,
    high: -20.5,
    quotes: [
      { bookmaker: "sportsbet", title: "SportsBet", point: -21.5, price: 1.9 },
      { bookmaker: "pointsbetau", title: "PointsBet", point: -20.5, price: 1.9 },
    ],
  },
  fetchedAt: new Date("2026-06-13T02:00:00Z"),
  eventId: "abc123",
  commenceTime: new Date("2026-06-13T09:20:00Z"),
};

test("GET /api/odds/:round", async (t) => {
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

  // Disconnected before the drop, and dropped with a client of our own -
  // mongoose recreates the collections it knows about the moment after a
  // database is dropped, so dropping while connected leaves an empty database
  // standing rather than none at all.
  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;

    await mongoose.disconnect();

    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

  await db.Odds.deleteMany({});
  await db.Odds.create(ROW);

  let signedIn = true;
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = () => signedIn;
    req.user = { id: "someone", admin: false };
    next();
  });
  app.use("/api/odds", require("./odds"));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const get = async (path) => {
    const res = await fetch(`${base}/api/odds/${path}`);
    let json = null;
    try {
      json = JSON.parse(await res.text());
    } catch {
      /* not json */
    }
    return { status: res.status, body: json };
  };

  // --- the line ----------------------------------------------------------

  await t.test("the line is sent, not only the prices", async () => {
    const { status, body } = await get(`12?season=${YEAR}`);

    assert.equal(status, 200);
    assert.equal(body.games[5001].line.point, -21.5);
    assert.equal(body.games[5001].line.count, 7);
  });

  // Half a point of disagreement between books is the only signal available
  // that a game is hard to price, so it travels with the number.
  await t.test("and the range the books disagreed over", async () => {
    const { body } = await get(`12?season=${YEAR}`);

    assert.equal(body.games[5001].line.low, -21.5);
    assert.equal(body.games[5001].line.high, -20.5);
  });

  // Signed on the home team, which is the whole meaning of the number. A route
  // that dropped the sign would read as Melbourne being favoured.
  await t.test("the sign survives the round trip", async () => {
    const { body } = await get(`12?season=${YEAR}`);

    assert.ok(body.games[5001].line.point < 0, "Adelaide are giving the start");
  });

  await t.test("the prices still come through beside it", async () => {
    const { body } = await get(`12?season=${YEAR}`);
    const game = body.games[5001];

    assert.equal(game.home.best, 1.46);
    assert.equal(game.away.best, 2.9);
    assert.equal(game.home.bookmaker, "SportsBet");
    assert.ok(game.fetchedAt, "the card says how old the prices are");
  });

  // --- what is deliberately withheld -------------------------------------

  // Both sets of quotes are stored so the arithmetic stays revisable, and
  // neither is rendered. Nine games of them is roughly twenty times the
  // payload of the summary.
  await t.test("the raw quotes are kept back", async () => {
    const { body } = await get(`12?season=${YEAR}`);
    const game = body.games[5001];

    assert.equal(game.line.quotes, undefined);
    assert.equal(game.home.quotes, undefined);
    assert.equal(game.away.quotes, undefined);
  });

  // --- the rest of the route ---------------------------------------------

  await t.test("a round with nothing stored is empty, not an error", async () => {
    const { status, body } = await get(`13?season=${YEAR}`);

    assert.equal(status, 200);
    assert.deepEqual(body.games, {});
  });

  // Round 0 is a real round in this competition and is falsy, which is how it
  // would get rejected.
  await t.test("round 0 is a round", async () => {
    const { status } = await get(`0?season=${YEAR}`);

    assert.equal(status, 200);
  });

  await t.test("a round that is not a number is refused", async () => {
    assert.equal((await get(`nonsense?season=${YEAR}`)).status, 400);
    assert.equal((await get(`-1?season=${YEAR}`)).status, 400);
  });

  await t.test("signed out, the route refuses", async () => {
    signedIn = false;
    const { status } = await get(`12?season=${YEAR}`);
    signedIn = true;

    assert.equal(status, 401);
  });

  server.close();
});

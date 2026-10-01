// The admin-only routes turn away everyone else.
//
// requireAdmin guards the two season routes an ordinary player has no
// business reaching: the sync status, and the sync itself - the one route
// that rewrites shared fixture, ladder and team data from Squiggle. Until now
// no test reached it, so nothing would have noticed it letting a signed-in
// player through.
//
// The real session, passport and routes against a real MongoDB, as in
// emailChange.route.test.js. The sync is never actually run: an admin's
// request is shown to get past the guard by being refused for its body
// instead, which only the handler behind the guard does.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const passport = require("../config/passport");
const { sessionMiddleware } = require("../config/session");
const { forgetAll } = require("../services/sessionUsers");

const URI =
  process.env.ADMIN_ROUTE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-admin";

test("the admin-only routes", async (t) => {
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
  await db.User.init();

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(
    sessionMiddleware({
      client: mongoose.connection.getClient(),
      secret: "test secret",
      secure: false,
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use("/api/auth", require("./api/auth"));
  app.use("/api/season", require("./season"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  let address = 0;
  const call = async (method, path, body, cookie) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `192.0.2.${(++address % 250) + 1}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
    const cookies = res.headers.getSetCookie();
    return {
      status: res.status,
      body: await res.json().catch(() => null),
      cookie: cookies.length
        ? cookies.map((c) => c.split(";")[0]).join("; ")
        : null,
    };
  };

  // A signed-in player, made an admin or not. Registering signs you in; the
  // flag is set in the database afterwards, as an admin is made in practice,
  // and the remembered copy of the user is dropped so the next request sees it
  // (services/sessionUsers.js).
  const player = async (name, { admin = false } = {}) => {
    const res = await call("POST", "/api/auth/register", {
      username: name,
      email: `${name}@admin.test`,
      password: "Passw0rd1",
      firstName: name,
      lastName: "Test",
    });
    assert.equal(res.status, 201);
    if (admin) {
      await db.User.updateOne({ username: name }, { $set: { admin: true } });
      forgetAll();
    }
    return res.cookie;
  };

  await db.User.deleteMany({});
  const member = await player("member");
  const admin = await player("boss", { admin: true });

  for (const [method, path, body] of [
    ["GET", "/api/season/status?season=2026"],
    ["POST", "/api/season/sync", { year: 2026 }],
  ]) {
    await t.test(
      `${method} ${path.split("?")[0]}: signed out is 401`,
      async () => {
        const res = await call(method, path, body);
        assert.equal(res.status, 401);
      }
    );

    await t.test(
      `${method} ${path.split("?")[0]}: a player is 403`,
      async () => {
        const res = await call(method, path, body, member);
        assert.equal(res.status, 403);
        assert.equal(res.body.message, "Admin rights required.");
      }
    );
  }

  await t.test("an admin reads the sync status", async () => {
    const res = await call(
      "GET",
      "/api/season/status?season=2026",
      null,
      admin
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.season, 2026);
    assert.deepEqual(res.body.scoredRounds, []);
  });

  // Past the guard and into the handler, which turns the body away before
  // anything reaches Squiggle.
  await t.test("an admin reaches the sync", async () => {
    const res = await call("POST", "/api/season/sync", { year: "soon" }, admin);

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "year must be a number.");
  });

  // The same request from a player never gets that far.
  await t.test("which a player's identical request does not", async () => {
    const res = await call(
      "POST",
      "/api/season/sync",
      { year: "soon" },
      member
    );

    assert.equal(res.status, 403);
  });

  // Being made an admin is a database change, not something a session can
  // claim: the flag is read from the account on each request.
  await t.test("and losing the flag loses the access", async () => {
    await db.User.updateOne({ username: "boss" }, { $set: { admin: false } });
    forgetAll();

    const res = await call(
      "GET",
      "/api/season/status?season=2026",
      null,
      admin
    );

    assert.equal(res.status, 403);
  });
});

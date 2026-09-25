// Following an invite, from registering to joining.
//
// UX audit finding #4. Opening an invite link joined the league on the spot,
// $5 a round and all, without showing what it was. And someone new who
// registered on the way lost the invite: registering sent them back to the
// sign-in form, and signing in landed them on Home.
//
// So registering now signs you in, an invite can be looked at before it is
// used (POST /api/leagues/preview), and joining is its own request. The real
// session, passport, auth and league routes against a real MongoDB.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const passport = require("../config/passport");
const { sessionMiddleware } = require("../config/session");

const URI =
  process.env.INVITE_TEST_URI || "mongodb://localhost/twin-tips-test-invite";

const PASSWORD = "Passw0rd1";

test("following an invite", async (t) => {
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
  await db.League.init();
  await db.LeagueMembership.init();

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
  app.use("/api/leagues", require("./leagues"));
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
        "X-Forwarded-For": `203.0.113.${++address}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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

  const register = (username) =>
    call("POST", "/api/auth/register", {
      username,
      email: `${username}@invite.test`,
      password: PASSWORD,
      firstName: "New",
      lastName: "Player",
      favTeam: 1,
    });

  // A league run by somebody else: a $5 Round Pool with its admin in it.
  const league = async () => {
    const admin = await db.User.create({
      username: "priya",
      email: "priya@invite.test",
      firstName: "Priya",
      lastName: "S",
      favTeam: 2,
      password: "x",
    });
    const made = await db.League.create({
      name: "Work Mates",
      slug: "work-mates",
      type: "weekly",
      buyIn: 5,
      admin: admin._id,
      createdSeason: 2026,
      startRound: 0,
    });
    await db.LeagueMembership.create({ league: made._id, user: admin._id });
    return made;
  };

  const reset = async () => {
    await Promise.all([
      db.User.deleteMany({}),
      db.League.deleteMany({}),
      db.LeagueMembership.deleteMany({}),
    ]);
  };

  await t.test("registering signs you in", async () => {
    await reset();

    const res = await register("newbie");

    assert.equal(res.status, 201);
    assert.equal(res.body.isAuthenticated, true);
    assert.equal(res.body.user, "newbie");
    assert.ok(res.cookie, "a session cookie comes back");

    const who = await call("GET", "/api/auth/", null, res.cookie);
    assert.equal(who.status, 200);
    assert.equal(who.body.isAuthenticated, true);
    assert.equal(who.body.user, "newbie");
  });

  await t.test(
    "an invite is shown before it is used, and not used by showing it",
    async () => {
      await reset();
      const pool = await league();
      const { cookie } = await register("newbie");

      const res = await call(
        "POST",
        "/api/leagues/preview",
        { token: pool.inviteToken },
        cookie
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.name, "Work Mates");
      assert.equal(res.body.type, "weekly");
      assert.equal(res.body.buyIn, 5);
      assert.equal(res.body.admin, "priya");
      assert.equal(res.body.members, 1);
      assert.equal(res.body.alreadyMember, false);
      assert.equal(res.body.slug, undefined, "no slug for a stranger");

      const me = await db.User.findOne({ username: "newbie" });
      assert.equal(
        await db.LeagueMembership.countDocuments({ user: me._id }),
        0,
        "looking at an invite joins nothing"
      );
    }
  );

  await t.test("a join code previews the same league", async () => {
    await reset();
    const pool = await league();
    const { cookie } = await register("newbie");

    const res = await call(
      "POST",
      "/api/leagues/preview",
      { code: pool.joinCode.toLowerCase() },
      cookie
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.name, "Work Mates");
  });

  await t.test("an invite that points nowhere says so", async () => {
    await reset();
    const { cookie } = await register("newbie");

    const res = await call(
      "POST",
      "/api/leagues/preview",
      { token: "0".repeat(32) },
      cookie
    );

    assert.equal(res.status, 404);
    assert.equal(
      res.body.message,
      "That invite is not valid. Ask for a new link."
    );
  });

  await t.test(
    "joining is its own step, and the preview then knows",
    async () => {
      await reset();
      const pool = await league();
      const { cookie } = await register("newbie");

      const joined = await call(
        "POST",
        "/api/leagues/join",
        { token: pool.inviteToken },
        cookie
      );
      assert.equal(joined.status, 200);
      assert.equal(joined.body.slug, "work-mates");

      const again = await call(
        "POST",
        "/api/leagues/preview",
        { token: pool.inviteToken },
        cookie
      );
      assert.equal(again.body.alreadyMember, true);
      assert.equal(again.body.slug, "work-mates");
      assert.equal(again.body.members, 2);
    }
  );

  await t.test("signed out, an invite cannot be looked at", async () => {
    await reset();
    const pool = await league();

    const res = await call("POST", "/api/leagues/preview", {
      token: pool.inviteToken,
    });

    assert.equal(res.status, 401);
  });
});

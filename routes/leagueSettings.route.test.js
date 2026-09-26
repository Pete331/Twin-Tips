// A league's own settings, as its members and its admin see them.
//
// UX audit finding #19: only the admin saw the invite, so a member who wanted
// to bring a mate had to ask for it. Every member sees it now unless the admin
// has switched that off. The real session, passport, auth and league routes
// against a real MongoDB.
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
  process.env.LEAGUE_SETTINGS_TEST_URI ||
  "mongodb://localhost/twin-tips-test-league-settings";

const PASSWORD = "Passw0rd1";

test("a league's settings", async (t) => {
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
        "X-Forwarded-For": `198.51.100.${++address}`,
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

  // Registering signs you in, so each person comes back with a session.
  const person = async (username) => {
    const res = await call("POST", "/api/auth/register", {
      username,
      email: `${username}@settings.test`,
      password: PASSWORD,
      firstName: "A",
      lastName: "Player",
      favTeam: 1,
    });
    assert.equal(res.status, 201);
    const user = await db.User.findOne({ username });
    return { id: user._id, cookie: res.cookie };
  };

  // A Round Pool run by `admin` with `member` in it. `over` sets fields on
  // the league as stored, which is how a league from before a setting existed
  // is made.
  const setUp = async (over = {}) => {
    await Promise.all([
      db.User.deleteMany({}),
      db.League.deleteMany({}),
      db.LeagueMembership.deleteMany({}),
    ]);
    const admin = await person("zoe");
    const member = await person("pete");
    const league = await db.League.create({
      name: "Friday Night Footy",
      slug: "fnf",
      type: "weekly",
      buyIn: 10,
      admin: admin.id,
      createdSeason: 2026,
      startRound: 0,
      ...over,
    });
    await db.LeagueMembership.create({ league: league._id, user: admin.id });
    await db.LeagueMembership.create({ league: league._id, user: member.id });
    return { admin, member, league };
  };

  await t.test("a member sees the invite, to share it", async () => {
    const { member, league } = await setUp();

    const res = await call("GET", "/api/leagues/fnf", null, member.cookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.isAdmin, false);
    assert.equal(res.body.membersCanInvite, true);
    assert.deepEqual(res.body.invite, {
      token: league.inviteToken,
      code: league.joinCode,
    });
  });

  // Leagues stored before the setting existed have no value for it, which
  // reads as the default rather than as "off".
  await t.test(
    "so does a member of a league older than the setting",
    async () => {
      const { member } = await setUp();
      await db.League.collection.updateOne(
        { slug: "fnf" },
        { $unset: { membersCanInvite: "" } }
      );

      const res = await call("GET", "/api/leagues/fnf", null, member.cookie);

      assert.equal(res.body.membersCanInvite, true);
      assert.ok(res.body.invite);
    }
  );

  await t.test("the admin can keep it to themselves", async () => {
    const { admin, member } = await setUp();

    const off = await call(
      "PATCH",
      "/api/leagues/fnf",
      { membersCanInvite: false },
      admin.cookie
    );
    assert.equal(off.status, 200);
    assert.equal(off.body.membersCanInvite, false);
    assert.ok(off.body.invite, "the admin still has it");

    const seen = await call("GET", "/api/leagues/fnf", null, member.cookie);
    assert.equal(seen.body.membersCanInvite, false);
    assert.equal(seen.body.invite, undefined);

    const own = await call("GET", "/api/leagues/fnf", null, admin.cookie);
    assert.ok(own.body.invite);
  });

  await t.test("and share it again", async () => {
    const { admin, member } = await setUp({ membersCanInvite: false });

    await call(
      "PATCH",
      "/api/leagues/fnf",
      { membersCanInvite: true },
      admin.cookie
    );

    const seen = await call("GET", "/api/leagues/fnf", null, member.cookie);
    assert.ok(seen.body.invite);
  });

  // "false" is truthy. Read as on, it would share an invite the admin had
  // just asked to keep.
  await t.test("only a real true or false is taken", async () => {
    const { admin } = await setUp({ membersCanInvite: false });

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { membersCanInvite: "false" },
      admin.cookie
    );

    assert.equal(res.status, 400);
    const stored = await db.League.findOne({ slug: "fnf" });
    assert.equal(stored.membersCanInvite, false);
  });

  await t.test("a member can't change who sees it", async () => {
    const { member } = await setUp();

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { membersCanInvite: false },
      member.cookie
    );

    assert.equal(res.status, 403);
    const stored = await db.League.findOne({ slug: "fnf" });
    assert.equal(stored.membersCanInvite, true);
  });

  // Only the admin can replace the invite, whoever can see it.
  await t.test("nor replace it", async () => {
    const { member, league } = await setUp();

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { regenerateInvite: true },
      member.cookie
    );

    assert.equal(res.status, 403);
    const stored = await db.League.findOne({ slug: "fnf" });
    assert.equal(stored.inviteToken, league.inviteToken);
  });

  // A member who has been removed can't read the league, so can't read the
  // invite either - and replacing it stops the copy they already have.
  await t.test("a removed member no longer gets it", async () => {
    const { admin, member } = await setUp();

    await call(
      "DELETE",
      `/api/leagues/fnf/members/${member.id}`,
      null,
      admin.cookie
    );
    const res = await call("GET", "/api/leagues/fnf", null, member.cookie);

    assert.equal(res.status, 404);
    assert.equal(res.body.invite, undefined);
  });

  // An admin who hands the league on is a member from then on, and the
  // answer follows the setting for members.
  await t.test("handing the league on answers by the member rule", async () => {
    const { admin, member } = await setUp({ membersCanInvite: false });

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { admin: String(member.id) },
      admin.cookie
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.isAdmin, false);
    assert.equal(res.body.invite, undefined);
  });

  // UX audit finding #24: a pool said what to pay and never how. The admin
  // can say, and every member reads it.
  await t.test("the admin can say how to pay in", async () => {
    const { admin, member } = await setUp();

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { paymentNote: "  PayID 0400 000 000, by Sunday  " },
      admin.cookie
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.paymentNote, "PayID 0400 000 000, by Sunday");

    const seen = await call("GET", "/api/leagues/fnf", null, member.cookie);
    assert.equal(seen.body.paymentNote, "PayID 0400 000 000, by Sunday");
  });

  // Beside the balances it settles.
  await t.test("and the standings carry it", async () => {
    const { member } = await setUp({ paymentNote: "Cash on Friday" });

    const res = await call(
      "GET",
      "/api/leagues/fnf/standings?season=2026",
      null,
      member.cookie
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.league.paymentNote, "Cash on Friday");
  });

  await t.test("a league without one says nothing", async () => {
    const { member } = await setUp();

    const res = await call("GET", "/api/leagues/fnf", null, member.cookie);

    assert.equal(res.body.paymentNote, "");
  });

  await t.test("an empty note clears it", async () => {
    const { admin } = await setUp({ paymentNote: "Cash on Friday" });

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { paymentNote: "   " },
      admin.cookie
    );

    assert.equal(res.status, 200);
    const stored = await db.League.findOne({ slug: "fnf" });
    assert.equal(stored.paymentNote, "");
  });

  await t.test("a note is text, and not an essay", async () => {
    const { admin } = await setUp({ paymentNote: "Cash on Friday" });

    const long = await call(
      "PATCH",
      "/api/leagues/fnf",
      { paymentNote: "x".repeat(201) },
      admin.cookie
    );
    const notText = await call(
      "PATCH",
      "/api/leagues/fnf",
      { paymentNote: 42 },
      admin.cookie
    );

    assert.equal(long.status, 400);
    assert.equal(notText.status, 400);
    const stored = await db.League.findOne({ slug: "fnf" });
    assert.equal(stored.paymentNote, "Cash on Friday");
  });

  await t.test("two hundred characters is allowed", async () => {
    const { admin } = await setUp();

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { paymentNote: "x".repeat(200) },
      admin.cookie
    );

    assert.equal(res.status, 200);
  });

  // Measured after trimming, so a stray space pasted around a full note
  // doesn't push it over.
  await t.test("spaces around a full note don't count", async () => {
    const { admin } = await setUp();

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { paymentNote: ` ${"x".repeat(200)} ` },
      admin.cookie
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.paymentNote.length, 200);
  });

  await t.test("only the admin writes it", async () => {
    const { member } = await setUp();

    const res = await call(
      "PATCH",
      "/api/leagues/fnf",
      { paymentNote: "Send it to me" },
      member.cookie
    );

    assert.equal(res.status, 403);
    const stored = await db.League.findOne({ slug: "fnf" });
    assert.equal(stored.paymentNote, "");
  });
});

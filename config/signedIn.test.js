// What finding out who is asking costs a signed-in request.
//
// Measured on the live site: ~510ms of every signed-in request, before a route
// did anything - three database round trips at ~155ms each from Render to
// Atlas (review finding #27). Read the session, look the user up, write the
// session back. The tips page makes five such requests, so a page load paid
// for fifteen.
//
// Now the session is written back at most once a day (config/session.js) and
// the user is remembered for a minute (services/sessionUsers.js), so the same
// five requests cost five session reads and one lookup.
//
// The real session configuration, the real passport setup, the real auth
// routes and a real MongoDB, with every command the driver sends counted.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const passport = require("./passport");
const { sessionMiddleware } = require("./session");
const { requireAuth } = require("../middleware/auth");
const sessionUsers = require("../services/sessionUsers");

const URI =
  process.env.SIGNED_IN_TEST_URI || "mongodb://localhost/twin-tips-test-signedin";

test("a signed-in request", async (t) => {
  try {
    await mongoose.connect(URI, {
      serverSelectionTimeoutMS: 1500,
      monitorCommands: true,
    });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  // Index building is Mongoose's, once, in the background after connecting -
  // not something a request pays for. Finished here so it cannot land in the
  // middle of a count.
  await db.User.init();
  await db.User.deleteMany({});
  await mongoose.connection.db.collection("sessions").deleteMany({});
  const ann = await db.User.create({
    username: "signedin_ann", email: "ann@signedin.test", password: "x",
    firstName: "Ann", lastName: "Signedin", favTeam: 1,
  });

  // Every command sent to the two collections this is about, apart from index
  // maintenance - the session store sets up its expiry index once, when it is
  // first used, and that is not a cost any request carries.
  const seen = [];
  mongoose.connection.getClient().on("commandStarted", (event) => {
    const collection = event.command[event.commandName];
    if (event.commandName === "createIndexes") return;
    if (collection === "sessions" || collection === "users") {
      seen.push(`${event.commandName} ${collection}`);
    }
  });
  const count = (fn) => async () => {
    seen.length = 0;
    await fn();
    return [...seen];
  };

  const app = express();
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
  // Signing in without the password check, which is not what this is about.
  app.post("/sign-in", async (req, res, next) => {
    const user = await db.User.findOne({ username: req.body.username });
    req.login(user, (err) => (err ? next(err) : res.json({ ok: true })));
  });
  app.get("/me", requireAuth, (req, res) => res.json({ username: req.user.username }));
  app.use("/api/auth", require("../routes/api/auth"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const signIn = async (username = "signedin_ann") => {
    const res = await fetch(`${base}/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    await res.text();
    return res.headers.get("set-cookie").split(";")[0];
  };
  // The whole response, every time: express-session finishes its own work on
  // the store before it sends the end of the body, not before the headers.
  const me = async (cookie) => {
    const res = await fetch(`${base}/me`, { headers: { cookie } });
    return { status: res.status, body: await res.json() };
  };

  await t.test("a page's five requests: five session reads and one lookup, no writes", async () => {
    sessionUsers.forgetAll();
    const cookie = await signIn();

    const commands = await count(async () => {
      for (let i = 0; i < 5; i += 1) {
        const res = await me(cookie);
        assert.deepEqual(res.body, { username: "signedin_ann" });
      }
    })();

    assert.deepEqual(commands.sort(), [
      ...Array(5).fill("find sessions"),
      "find users",
    ].sort());
  });

  await t.test("after a minute it looks the user up again", async () => {
    sessionUsers.forgetAll();
    const cookie = await signIn();
    await me(cookie);

    t.mock.timers.enable({ apis: ["Date"], now: Date.now() + sessionUsers.REMEMBER_MS + 1000 });
    const commands = await count(() => me(cookie))();
    t.mock.timers.reset();

    assert.equal(commands.filter((c) => c === "find users").length, 1);
  });

  // The case that rules out keeping a copy of the user in the session: a new
  // name has to show everywhere, straight away.
  await t.test("a new username shows at once", async () => {
    sessionUsers.forgetAll();
    const cookie = await signIn();
    await me(cookie);

    const res = await fetch(`${base}/api/auth/username`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ username: "signedin_annie" }),
    });
    assert.equal(res.status, 200);
    await res.text();

    assert.deepEqual((await me(cookie)).body, { username: "signedin_annie" });
    await db.User.updateOne({ _id: ann._id }, { username: "signedin_ann" });
    sessionUsers.forgetUser(ann._id);
  });

  // Kept, with its details overwritten, so that the rounds it played still
  // add up (DELETE /api/deleteUser). Nobody is signed in as it.
  await t.test("a deleted account is not signed in, even with a session left over", async () => {
    sessionUsers.forgetAll();
    const cookie = await signIn();
    await db.User.updateOne({ _id: ann._id }, { deletedAt: new Date() });
    sessionUsers.forgetUser(ann._id);

    const res = await me(cookie);

    assert.equal(res.status, 401);
    await db.User.updateOne({ _id: ann._id }, { deletedAt: null });
  });

  // One object serves every request for the next minute.
  await t.test("the remembered user cannot be changed by a route", async () => {
    sessionUsers.forgetAll();
    const user = await sessionUsers.findSessionUser(ann._id);

    assert.ok(Object.isFrozen(user));
    assert.equal(await sessionUsers.findSessionUser(ann._id), user, "the same one");
  });
});

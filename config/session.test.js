// What a signed-in request costs the session store.
//
// Measured on the live site: recognising who is asking took ~510ms of every
// signed-in request, three database round trips at ~155ms each (review
// finding #27). One was this - the cookie rolls on every response, and the
// store followed it with an update to the session document every time. Now an
// unchanged session is written back at most once a day.
//
// The real session configuration, a real store, a real MongoDB: the writes
// are counted as the driver issues them, not inferred from the code.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const { sessionMiddleware, createStore, TOUCH_AFTER_S } = require("./session");

const URI =
  process.env.SESSION_TEST_URI || "mongodb://localhost/twin-tips-test-session";

const WRITES = new Set(["insert", "update", "delete", "findAndModify"]);

test("the session store", async (t) => {
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

  const sessions = mongoose.connection.db.collection("sessions");
  await sessions.deleteMany({});

  // Every write the driver sends to the sessions collection.
  let writes = 0;
  mongoose.connection.getClient().on("commandStarted", (event) => {
    if (
      WRITES.has(event.commandName) &&
      event.command[event.commandName] === "sessions"
    ) {
      writes += 1;
    }
  });

  const app = express();
  app.use(
    sessionMiddleware({
      client: mongoose.connection.getClient(),
      secret: "test secret",
      secure: false,
    })
  );
  app.post("/sign-in", (req, res) => {
    req.session.who = "ann";
    res.json({ ok: true });
  });
  app.get("/me", (req, res) => res.json({ who: req.session.who || null }));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  // Both read the whole body. express-session sends the headers before its
  // write to the store has finished and the rest of the body after, so a test
  // that stopped at the headers could count before the write was even sent.
  const cookieOf = (res) => res.headers.get("set-cookie").split(";")[0];
  const get = async (cookie) => {
    const res = await fetch(`${base}/me`, { headers: { cookie } });
    const body = await res.json();
    return { status: res.status, headers: res.headers, body };
  };
  const signIn = async () => {
    const res = await fetch(`${base}/sign-in`, { method: "POST" });
    await res.text();
    return cookieOf(res);
  };
  const idOf = (cookie) =>
    decodeURIComponent(cookie.split("=")[1]).slice(2).split(".")[0];

  await t.test("signing in writes the session once", async () => {
    writes = 0;
    await signIn();
    assert.equal(writes, 1);
  });

  // The five-request page load this is about.
  await t.test("the requests after that write nothing", async () => {
    const cookie = await signIn();
    writes = 0;

    for (let i = 0; i < 5; i += 1) {
      const res = await get(cookie);
      assert.deepEqual(res.body, { who: "ann" }, "still signed in");
    }

    assert.equal(writes, 0);
  });

  // Rolling is kept: the browser's copy of the cookie is renewed on every
  // response, so a month is still measured from the last visit.
  await t.test("the cookie still rolls on every response", async () => {
    const cookie = await signIn();
    const res = await get(cookie);

    assert.match(res.headers.get("set-cookie") || "", /Expires=/);
  });

  // A day on, the stored session is extended - once.
  await t.test(
    "after a day an unchanged session is written back once",
    async () => {
      const cookie = await signIn();
      const _id = idOf(cookie);
      const dayAgo = new Date(Date.now() - (TOUCH_AFTER_S + 60) * 1000);
      await sessions.updateOne({ _id }, { $set: { lastModified: dayAgo } });
      const before = (await sessions.findOne({ _id })).expires;
      writes = 0;

      await get(cookie);
      await get(cookie);

      assert.equal(writes, 1);
      assert.ok(
        (await sessions.findOne({ _id })).expires > before,
        "and its expiry moves on"
      );
    }
  );

  // Everybody signed in on the day this deploys has a session written without
  // a lastModified, which connect-mongo on its own would touch on every
  // request for as long as the session lasts.
  await t.test(
    "a session from before this change stops writing after one touch",
    async () => {
      const cookie = await signIn();
      const _id = idOf(cookie);
      await sessions.updateOne({ _id }, { $unset: { lastModified: "" } });
      writes = 0;

      await get(cookie);
      await get(cookie);
      await get(cookie);

      assert.equal(writes, 1);
    }
  );

  // Kept from before, and never tested until now: a session that goes between
  // being read and being touched - expired or purged mid-request - is not a
  // server error. The store's own touch reports it as one.
  await t.test(
    "touching a session that has just gone is not an error",
    async () => {
      const store = createStore(mongoose.connection.getClient());

      const err = await new Promise((resolve) =>
        store.touch(
          "gone-mid-request",
          { cookie: { expires: new Date(Date.now() + 60000) } },
          resolve
        )
      );

      assert.equal(err, null);
    }
  );

  // Kept from before: a cookie whose session is gone is somebody signed out,
  // not a server error.
  await t.test(
    "a cookie whose session has gone is simply signed out",
    async () => {
      const cookie = await signIn();
      await sessions.deleteOne({ _id: idOf(cookie) });

      const res = await get(cookie);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { who: null });
    }
  );
});

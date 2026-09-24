// GET /api/health - whether this instance can do its job.
//
// Render calls it to decide whether a new deploy may take traffic
// (healthCheckPath in render.yaml), and an outside pinger can call it to keep
// the free instance awake. So it answers anyone, says nothing more than
// whether the database is connected, and must never be cached - a stored
// "ok" is exactly the wrong answer to a health check.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const URI =
  process.env.HEALTH_TEST_URI || "mongodb://localhost/twin-tips-test-health";

test("GET /api/health", async (t) => {
  const app = express();
  app.use("/api/health", require("./health"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const health = () => fetch(`http://127.0.0.1:${server.address().port}/api/health`);

  await t.test("without a database it is unhealthy", async () => {
    assert.notEqual(mongoose.connection.readyState, 1, "precondition: not connected");

    const res = await health();

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, database: "unavailable" });
  });

  // Connecting is not connected. A deploy whose database never answers sits
  // here until the driver gives up, and must not be sent traffic meanwhile.
  await t.test("nor while it is still connecting", async () => {
    const pending = mongoose
      .connect("mongodb://127.0.0.1:1/twin-tips-test-nowhere", {
        serverSelectionTimeoutMS: 1000,
      })
      .catch(() => {});
    assert.equal(mongoose.connection.readyState, 2, "precondition: connecting");

    const res = await health();
    await pending;

    assert.equal(res.status, 503);
  });

  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  await t.test("with one it is healthy", async () => {
    const res = await health();

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, database: "connected" });
  });

  await t.test("and neither answer can be cached", async () => {
    const res = await health();

    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});

// Before the session middleware, so a pinger every few minutes never reaches
// the session store and nothing about it depends on being signed in.
test("server.js mounts it ahead of sessions and sign-in", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const health = source.indexOf('app.use("/api/health"');
  // Built in config/session.js and mounted from here.
  const session = source.indexOf("sessionMiddleware({");

  assert.ok(health > 0, "the health route is mounted");
  assert.ok(session > 0, "the scan still finds the session middleware");
  assert.ok(health < session, "and it comes first");
});

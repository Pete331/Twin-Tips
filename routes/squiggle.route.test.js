// The browser-facing Squiggle proxy.
//
// The tips page waits on it - the model predictions - before it stops showing
// that it is updating. It used the 15-second budget meant for the hourly sync,
// so a slow Squiggle held the page for 15 seconds. A person is waiting on this
// one, the same as on live scores, which already allow 4.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const squiggle = require("../services/squiggle");

const withApp = async (t) => {
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = () => true;
    next();
  });
  app.use("/api/squiggle", require("./squiggle"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  return (path) => fetch(`http://127.0.0.1:${server.address().port}${path}`);
};

test("the proxy gives Squiggle as long as a person will wait, not the sync's budget", async (t) => {
  const calls = [];
  const original = squiggle.query;
  squiggle.query = async (type, params, options) => {
    calls.push({ type, params, options });
    return { tips: [] };
  };
  t.after(() => {
    squiggle.query = original;
  });
  const get = await withApp(t);

  const res = await get("/api/squiggle/tips?year=2026&round=3&source=8");

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, { year: "2026", round: "3", source: "8" });
  assert.ok(calls[0].options && calls[0].options.timeoutMs <= 4000, "4 seconds at most");
});

test("and says so when Squiggle does not answer in time", async (t) => {
  const original = squiggle.query;
  squiggle.query = async () => {
    throw new Error("Squiggle did not respond within 4000ms");
  };
  t.after(() => {
    squiggle.query = original;
  });
  const get = await withApp(t);

  const res = await get("/api/squiggle/tips?year=2026&round=3");

  assert.equal(res.status, 502);
  assert.equal((await res.json()).message, "Unable to reach the Squiggle API.");
});

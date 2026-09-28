// Whether a password reset link still works, asked before its form is shown.
//
// UX audit finding #22: the reset page showed the whole "Create New Password"
// form for any link, so somebody holding an expired or used one found out only
// after typing a new password twice. The page now asks first.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const controller = require("./authController");

const URI =
  process.env.RESET_CHECK_TEST_URI ||
  "mongodb://localhost/twin-tips-test-reset-check";

// The same hashing the controller stores tokens with.
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

test("checking a reset link", async (t) => {
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

  const app = express();
  app.use(express.json());
  app.post("/check", controller.checkResetToken);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const check = async (token) => {
    const res = await fetch(`${base}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return { status: res.status, body: await res.json() };
  };

  // One account, with a reset pending that expires `inMs` from now.
  const pending = async (token, inMs) => {
    await db.User.deleteMany({});
    await db.User.create({
      firstName: "Pat",
      lastName: "Reset",
      username: "pat_reset",
      email: "pat@reset.test",
      password: "x",
      favTeam: 1,
      resetPassToken: hash(token),
      tokenExpiration: Date.now() + inMs,
    });
  };

  const TOKEN = "a".repeat(80);

  await t.test("a link still in date works", async () => {
    await pending(TOKEN, 10 * 60 * 1000);

    const r = await check(TOKEN);

    assert.equal(r.status, 200);
    assert.equal(r.body.valid, true);
  });

  await t.test("an expired one doesn't", async () => {
    await pending(TOKEN, -1000);

    const r = await check(TOKEN);

    assert.equal(r.status, 422);
    assert.equal(r.body.valid, false);
    assert.match(r.body.message, /expired or has already been used/);
  });

  // A used token is removed, so it matches nobody.
  await t.test("nor one that matches nobody", async () => {
    await pending(TOKEN, 10 * 60 * 1000);

    const r = await check("b".repeat(80));

    assert.equal(r.status, 422);
    assert.equal(r.body.valid, false);
  });

  // The body is JSON, and an object in a query filter is an operator: this
  // would otherwise match any account with a reset pending.
  await t.test("an operator instead of a token matches nobody", async () => {
    await pending(TOKEN, 10 * 60 * 1000);

    const r = await check({ $ne: null });

    assert.equal(r.status, 422);
  });

  await t.test("nor does nothing at all", async () => {
    await pending(TOKEN, 10 * 60 * 1000);

    const r = await check("");

    assert.equal(r.status, 422);
  });

  // Asking doesn't use the link up.
  await t.test("checking leaves the link working", async () => {
    await pending(TOKEN, 10 * 60 * 1000);

    await check(TOKEN);
    const stored = await db.User.findOne({ username: "pat_reset" }).select(
      "+resetPassToken"
    );

    assert.equal(stored.resetPassToken, hash(TOKEN));
  });
});

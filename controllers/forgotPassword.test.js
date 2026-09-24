// The password-reset request, and what it will accept as an address.
//
// This route is public - it is for people who cannot sign in - and it looks
// an account up by whatever email it is given. It used to be given the body as
// parsed, and a JSON body carries objects as happily as strings: during the
// review {"email": {"$ne": null}} matched the first account in the collection
// and issued it a reset token, and {"$regex": "^p"} found a real user by the
// first letter of their address.
//
// Neither is an account takeover - the link goes to the owner's inbox, not the
// caller's. What an anonymous caller could do was send reset mail to people
// whose addresses they did not know, overwrite a reset somebody had genuinely
// started, and use the time a matching request spends sending mail to spell
// addresses out a letter at a time.
//
// The mailer is stood in for before the controller loads, so nothing is sent:
// what each case records is who was mailed and whether a token was written.
// The rate limiter is not mounted - it allows five an hour, and this file sends
// more than that - and it is not what stops any of this.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const mailer = require("../utils/nodeMailer");
const mailed = [];
mailer.verifyMailer = async () => true;
mailer.sendMail = async (to) => {
  mailed.push(to);
};

const db = require("../models");
const controller = require("./authController");

const URI =
  process.env.FORGOT_TEST_URI || "mongodb://localhost/twin-tips-test-forgot";

test("asking for a password reset", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);

  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await mongoose.disconnect();
    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

  await db.User.deleteMany({});
  // Two accounts, so a query that matches "anyone" has somebody to find, and
  // one whose address starts with the letter the prefix probe used.
  await db.User.create([
    {
      firstName: "Pat",
      lastName: "Reset",
      username: "pat_reset",
      email: "pat@reset.test",
      password: "x",
      favTeam: 1,
    },
    {
      firstName: "Quin",
      lastName: "Reset",
      username: "quin_reset",
      email: "quin@reset.test",
      password: "x",
      favTeam: 2,
    },
  ]);

  const app = express();
  app.use(express.json());
  app.post("/forgot", controller.forgotPassword);
  // Register shares validEmail, which is where the array case is actually
  // stopped for it - it does not normalise the address the way reset now does.
  app.post("/register", controller.register);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const ask = async (email) => {
    mailed.length = 0;
    await db.User.updateMany(
      {},
      { $unset: { resetPassToken: "", tokenExpiration: "" } }
    );
    const res = await fetch(`${base}/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const tokens = await db.User.countDocuments({
      resetPassToken: { $exists: true },
    });
    return {
      status: res.status,
      body: await res.json(),
      mailed: mailed.slice(),
      tokens,
    };
  };

  // The case the route exists for, so the refusals below are refusing
  // something that otherwise works.
  await t.test("a registered address gets a link", async () => {
    const r = await ask("pat@reset.test");

    assert.equal(r.status, 200);
    assert.deepEqual(r.mailed, ["pat@reset.test"]);
    assert.equal(r.tokens, 1);
  });

  // Phones capitalise the first letter, and people paste addresses with a
  // space on the end. Both are still the address.
  await t.test("the same address typed as a phone types it", async () => {
    const r = await ask("  Pat@Reset.Test ");

    assert.equal(r.status, 200);
    assert.deepEqual(r.mailed, ["pat@reset.test"]);
  });

  // The answer that stops this being a way to ask who has an account.
  await t.test(
    "an address nobody has gets the same answer and no mail",
    async () => {
      const known = await ask("pat@reset.test");
      const unknown = await ask("nobody@reset.test");

      assert.equal(unknown.status, 200);
      assert.equal(unknown.body.message, known.body.message);
      assert.deepEqual(unknown.mailed, []);
      assert.equal(unknown.tokens, 0);
    }
  );

  // The injection. Before the fix this matched the first account and issued it
  // a token.
  await t.test("an operator instead of an address matches nobody", async () => {
    const r = await ask({ $ne: null });

    assert.equal(r.status, 400);
    assert.deepEqual(r.mailed, [], "nobody is mailed");
    assert.equal(r.tokens, 0, "no token is written onto anyone");
  });

  // The prefix probe. Before the fix this found quin by the letter q.
  await t.test("a pattern instead of an address matches nobody", async () => {
    const r = await ask({ $regex: "^q" });

    assert.equal(r.status, 400);
    assert.deepEqual(r.mailed, []);
    assert.equal(r.tokens, 0);
  });

  // regex.test coerces what it is given, so an array holding a real address
  // used to pass the email check as the array it was.
  await t.test("an address wrapped in an array is not an address", async () => {
    const r = await ask(["pat@reset.test"]);

    assert.equal(r.status, 400);
    assert.deepEqual(r.mailed, []);
  });

  // Something that is plainly not an address - a username, most likely - is
  // told so. That reveals nothing about who has an account; it is about the
  // shape of what was typed.
  await t.test(
    "a username in the email box is told it is not an address",
    async () => {
      const r = await ask("pat_reset");

      assert.equal(r.status, 400);
      assert.match(r.body.message, /valid email/i);
      assert.deepEqual(r.mailed, []);
    }
  );

  // The same check, on the other public route that takes an address. Register
  // validates rather than normalises, so this is the typeof in validEmail doing
  // the work: without it the array passes the pattern as "pat2@reset.test".
  await t.test(
    "registering with an address wrapped in an array is refused",
    async () => {
      const before = await db.User.countDocuments();
      const res = await fetch(`${base}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ["pat2@reset.test"],
          username: "pat_two",
          password: "Passw0rd",
          firstName: "Pat",
          lastName: "Two",
          favTeam: 1,
        }),
      });
      const body = await res.json();

      assert.equal(res.status, 400);
      assert.match(body.message, /valid email/i);
      assert.equal(
        await db.User.countDocuments(),
        before,
        "no account is created"
      );
    }
  );
});

// Signing in: the password's cost, and the per-account backoff.
//
// Review finding #25. Passwords were hashed at bcrypt's floor of 10; they are
// hashed at 12 now, and an old hash is made again at 12 when its owner next
// signs in. And sign-in was limited only per address, in memory - a deploy or
// a spin-down reset it, and guesses at one account from many addresses were
// never counted together. Now failures are counted per identifier as well,
// in the database (services/loginBackoff.js).
//
// The real session, passport and auth routes against a real MongoDB. Each case
// signs in from its own forwarded address, so the per-address limiter - which
// is still there, and counts in memory - never carries from one to the next.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const db = require("../models");
const passport = require("../config/passport");
const { sessionMiddleware } = require("../config/session");
const { BCRYPT_COST } = require("../utils/passwordHash");

const URI =
  process.env.LOGIN_TEST_URI || "mongodb://localhost/twin-tips-test-login";

const PASSWORD = "Passw0rd1";

test("signing in", async (t) => {
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
  await db.LoginFailure.init();

  const app = express();
  // Each case says where it comes from, so the per-address limiter counts
  // each one separately.
  // One hop, as server.js sets it for Render's proxy.
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
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  let address = 0;
  const from = () => `203.0.113.${++address}`;

  // One person, starting clean: an account at the old cost, and nothing
  // counted against anybody.
  const fresh = async () => {
    await db.User.deleteMany({});
    await db.LoginFailure.deleteMany({});
    return db.User.create({
      username: "ann",
      email: "ann@login.test",
      firstName: "Ann",
      lastName: "B",
      favTeam: 1,
      password: await bcrypt.hash(PASSWORD, 10),
    });
  };

  const signIn = async (ip, email, password) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => null);
    return {
      status: res.status,
      body,
      retryAfter: res.headers.get("retry-after"),
    };
  };
  const failTimes = async (ip, n, email = "ann") => {
    for (let i = 0; i < n; i += 1) {
      assert.equal((await signIn(ip, email, "wrong-password-1")).status, 401);
    }
  };
  const rounds = async () =>
    bcrypt.getRounds(
      (await db.User.findOne({ username: "ann" }).select("+password")).password
    );

  await t.test(
    "the right password signs in, and an old hash is made again at today's cost",
    async () => {
      await fresh();
      assert.equal(await rounds(), 10, "precondition: hashed at the old cost");

      const res = await signIn(from(), "ann", PASSWORD);

      assert.equal(res.status, 200);
      assert.equal(res.body.user, "ann");
      assert.equal(await rounds(), BCRYPT_COST);
      assert.equal(BCRYPT_COST, 12);
    }
  );

  await t.test("and the new hash still opens it", async () => {
    assert.equal((await signIn(from(), "ann", PASSWORD)).status, 200);
  });

  await t.test("a wrong password is refused", async () => {
    await fresh();
    const res = await signIn(from(), "ann", "wrong-password-1");

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Incorrect username, email or password");
  });

  // The backoff. Five failures are somebody mistyping; after that the account
  // has to wait, and the right password is turned away too - checking it
  // would tell a guesser when they had hit.
  await t.test(
    "after five failures the account has to wait, even for the right password",
    async () => {
      await fresh();
      const ip = from();
      await failTimes(ip, 5);

      const res = await signIn(from(), "ann", PASSWORD);

      assert.equal(res.status, 429);
      assert.match(res.body.message, /Try again in 30 seconds/);
      assert.equal(res.retryAfter, "30");
    }
  );

  // Counted per account, not per address: a different address is no way round.
  await t.test("from any address", async () => {
    assert.equal((await signIn(from(), "ann", PASSWORD)).status, 429);
  });

  // The same wait for an identifier that matches nobody, so how the backoff
  // answers says nothing about who has an account.
  await t.test(
    "an identifier that matches nobody waits exactly the same",
    async () => {
      await fresh();
      const ip = from();
      await failTimes(ip, 5, "nobody-at-all");

      const res = await signIn(from(), "nobody-at-all", PASSWORD);

      assert.equal(res.status, 429);
      assert.match(res.body.message, /Try again in 30 seconds/);
    }
  );

  await t.test(
    "capitals and stray spaces are the same identifier",
    async () => {
      await fresh();
      const ip = from();
      await failTimes(ip, 2, "Ann");
      await failTimes(ip, 3, "  ann ");

      assert.equal((await signIn(from(), "ANN", PASSWORD)).status, 429);
    }
  );

  await t.test("a success clears the count", async () => {
    await fresh();
    const ip = from();
    await failTimes(ip, 4);
    assert.equal((await signIn(ip, "ann", PASSWORD)).status, 200);
    await failTimes(ip, 4);

    assert.equal(
      (await signIn(ip, "ann", PASSWORD)).status,
      200,
      "four more is not five"
    );
  });

  // Doubling from 30 seconds: one more failure after the wait means a minute.
  await t.test("the wait ends, and the next failure waits longer", async () => {
    await fresh();
    await failTimes(from(), 5);
    const past = new Date(Date.now() - 31 * 1000);
    await db.LoginFailure.updateOne({ key: "ann" }, { $set: { lastAt: past } });

    await failTimes(from(), 1);
    const res = await signIn(from(), "ann", PASSWORD);

    assert.equal(res.status, 429);
    assert.match(res.body.message, /Try again in a minute/);
  });

  // The stand-in hash compared against for an unknown username has to cost
  // what a real one does, or how long a refusal takes says whether the account
  // exists. Timing is too noisy to test directly, so this checks the source:
  // the stand-in is made at the shared cost, not a number of its own.
  await t.test(
    "an unknown username costs the same bcrypt work as a real one",
    () => {
      const source = require("fs").readFileSync(
        require("path").join(__dirname, "..", "config", "passport.js"),
        "utf8"
      );
      assert.match(
        source,
        /ABSENT_USER_HASH = bcrypt\.hashSync\([\s\S]*?genSaltSync\(BCRYPT_COST\)/
      );
    }
  );

  // The way through for somebody kept out by another person's guesses.
  await t.test("a password reset clears the wait, by either name", async () => {
    const ann = await fresh();
    await failTimes(from(), 5, "ann");
    await failTimes(from(), 5, "ann@login.test");

    const token = crypto.randomBytes(20).toString("hex");
    await db.User.updateOne(
      { _id: ann._id },
      {
        resetPassToken: crypto.createHash("sha256").update(token).digest("hex"),
        tokenExpiration: new Date(Date.now() + 3600000),
      }
    );
    const reset = await fetch(`${base}/api/auth/reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": from(),
      },
      body: JSON.stringify({ token, password: "N3wpassword" }),
    });
    assert.equal(reset.status, 200);

    assert.equal((await signIn(from(), "ann", "N3wpassword")).status, 200);
    assert.equal(
      (await signIn(from(), "ann@login.test", "N3wpassword")).status,
      200
    );
  });
});

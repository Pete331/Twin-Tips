// Making an account and looking after it: registering, the name and password
// you can change while signed in, and the password you can reset when you
// cannot sign in at all.
//
// Found by measuring the server suite's coverage. Changing your password had
// no test at all - including the check that you know the current one, which is
// what stops an unattended session being used to lock its owner out. Most of
// registering's refusals, changing your username's, and every refusal on the
// reset link were unreached too: only the paths that succeed had been tried.
//
// The real session, passport and auth routes against a real MongoDB, as in
// emailChange.route.test.js. Runs against its own database, which it creates
// and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const passport = require("../config/passport");
const { sessionMiddleware } = require("../config/session");
const { forgetAll } = require("../services/sessionUsers");
const { USERNAME_RULE } = require("../utils/username");

const URI =
  process.env.ACCOUNT_ROUTE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-account";

const PASSWORD = "Passw0rd1";
const WEAK = "password";

test("an account", async (t) => {
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
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  // Each request from its own address, so the rate limits on these routes
  // (middleware/rateLimit.js) are never what a test is measuring.
  let address = 0;
  const call = async (path, body, cookie, method = "POST") => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `198.51.100.${(++address % 250) + 1}`,
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

  const details = (over = {}) => ({
    username: "pat",
    email: "pat@account.test",
    password: PASSWORD,
    firstName: "Pat",
    lastName: "Tester",
    ...over,
  });

  const register = (over) => call("/api/auth/register", details(over));
  const signIn = (identifier, password) =>
    call("/api/auth/login", { email: identifier, password });
  const whoAmI = (cookie) => call("/api/auth", null, cookie, "GET");

  // Nobody, no sessions, and no failed sign-ins counted from the last test -
  // or enough of those turn a wrong password's 401 into a wait's 429.
  const fresh = async () => {
    await db.User.deleteMany({});
    await db.LoginFailure.deleteMany({});
    await mongoose.connection.collection("sessions").deleteMany({});
    forgetAll();
  };

  // A fresh account, signed in. Registering signs you in.
  const signedUp = async (over) => {
    await fresh();
    const res = await register(over);
    assert.equal(res.status, 201);
    return res.cookie;
  };

  await t.test("registering", async (t) => {
    await t.test("needs every required field", async () => {
      await fresh();
      for (const missing of [
        "username",
        "email",
        "password",
        "firstName",
        "lastName",
      ]) {
        const res = await register({ [missing]: "" });
        assert.equal(res.status, 400, missing);
        assert.equal(res.body.message, "Please complete all required fields.");
      }
      assert.equal(await db.User.countDocuments(), 0);
    });

    // Optional (UX audit finding #22), but not anything at all.
    await t.test("takes a team as a number, or none", async () => {
      await fresh();

      const word = await register({ favTeam: "Carlton" });
      const negative = await register({ favTeam: -3 });
      assert.equal(word.status, 400);
      assert.equal(negative.status, 400);
      assert.equal(word.body.message, "That is not a team.");

      const team = await register({ favTeam: "4" });
      assert.equal(team.status, 201);
      assert.equal((await db.User.findOne({ username: "pat" })).favTeam, 4);
    });

    await t.test("refuses a weak password", async () => {
      await fresh();
      const res = await register({ password: WEAK });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /eight characters/);
    });

    await t.test("refuses something that is not an address", async () => {
      await fresh();
      const res = await register({ email: "pat at home" });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Please enter a valid email address.");
    });

    // An "@" in a username would make it impossible to sign in with: the
    // one field takes either, and is told apart by looking for one.
    await t.test("refuses a username that breaks the rule", async () => {
      await fresh();
      const res = await register({ username: "pat@home" });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, USERNAME_RULE);
    });

    await t.test("refuses a name that would pass for staff", async () => {
      await fresh();
      const res = await register({ username: "Admin" });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "That username is not available.");
    });

    await t.test("says when the address is taken, in any case", async () => {
      await signedUp();
      const res = await register({
        username: "someone",
        email: "PAT@Account.test",
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "That email is already in use.");
    });

    await t.test("says when the name is taken, in any case", async () => {
      await signedUp();
      const res = await register({
        username: "PAT",
        email: "other@account.test",
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "That username is already taken.");
    });

    // Only the fields a registrant may set are read. Spreading the body once
    // let a sign-up grant itself admin.
    await t.test("cannot make itself an admin", async () => {
      await fresh();
      const res = await call("/api/auth/register", {
        ...details(),
        admin: true,
      });

      assert.equal(res.status, 201);
      assert.equal((await db.User.findOne({ username: "pat" })).admin, false);
      assert.equal((await whoAmI(res.cookie)).body.admin, false);
    });

    // A lookup followed by a save is not atomic, so two sign-ups for one
    // address can both pass the check. The unique index decides, and the one
    // that loses is told the address is taken rather than "Internal server
    // issue".
    await t.test("two at once for one address make one account", async () => {
      await fresh();

      const results = await Promise.all([
        register({ username: "first" }),
        register({ username: "second" }),
      ]);

      assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
      assert.equal(
        results.find((r) => r.status === 400).body.message,
        "That email is already in use."
      );
      assert.equal(await db.User.countDocuments(), 1);
    });
  });

  await t.test("who is signed in", async (t) => {
    await t.test("nobody, without a session", async () => {
      const res = await whoAmI(null);
      assert.equal(res.status, 401);
    });

    await t.test("the account, with one", async () => {
      const cookie = await signedUp();
      const res = await whoAmI(cookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.user, "pat");
      assert.equal(res.body.isAuthenticated, true);
    });
  });

  await t.test("changing your username", async (t) => {
    const rename = (cookie, username) =>
      call("/api/auth/username", { username }, cookie);

    await t.test("needs you signed in", async () => {
      await signedUp();
      const res = await rename(null, "patricia");

      assert.equal(res.status, 401);
      assert.ok(await db.User.findOne({ username: "pat" }));
    });

    await t.test("keeps to the rule", async () => {
      const cookie = await signedUp();
      const res = await rename(cookie, "no spaces please");

      assert.equal(res.status, 400);
      assert.equal(res.body.message, USERNAME_RULE);
    });

    await t.test("and away from the reserved names", async () => {
      const cookie = await signedUp();
      const res = await rename(cookie, "Support");

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "That username is not available.");
    });

    await t.test("not to somebody else's, in any case", async () => {
      const cookie = await signedUp();
      await register({ username: "robin", email: "robin@account.test" });

      const res = await rename(cookie, "ROBIN");

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "That username is already taken.");
      assert.ok(await db.User.findOne({ username: "pat" }));
    });

    // Restyling your own name is not a clash with yourself.
    await t.test("but to your own in new capitals", async () => {
      const cookie = await signedUp();
      const res = await rename(cookie, "PaT");

      assert.equal(res.status, 200);
      assert.ok(await db.User.findOne({ username: "PaT" }));
    });

    await t.test("and the new name is the one you are, at once", async () => {
      const cookie = await signedUp();
      await whoAmI(cookie);

      const res = await rename(cookie, "patricia");

      assert.equal(res.status, 200);
      assert.equal((await whoAmI(cookie)).body.user, "patricia");
      assert.equal((await signIn("patricia", PASSWORD)).status, 200);
    });
  });

  await t.test("changing your password", async (t) => {
    const change = (cookie, currentPassword, newPassword) =>
      call("/api/auth/password", { currentPassword, newPassword }, cookie);

    // 200 or 401 and nothing else: a 429 from the sign-in backoff is neither
    // an answer that the password works nor that it doesn't.
    const stillOpensWith = async (password) => {
      const { status } = await signIn("pat", password);
      assert.ok(status === 200 || status === 401, `sign-in gave ${status}`);
      return status === 200;
    };

    await t.test("needs you signed in", async () => {
      await signedUp();
      const res = await change(null, PASSWORD, "N3wpassword");

      assert.equal(res.status, 401);
      assert.ok(await stillOpensWith(PASSWORD));
    });

    await t.test("needs both passwords", async () => {
      const cookie = await signedUp();

      const noCurrent = await change(cookie, "", "N3wpassword");
      const noNew = await change(cookie, PASSWORD, "");

      assert.equal(noCurrent.status, 400);
      assert.equal(noNew.status, 400);
      assert.ok(await stillOpensWith(PASSWORD));
    });

    await t.test("refuses a weak new one", async () => {
      const cookie = await signedUp();
      const res = await change(cookie, PASSWORD, WEAK);

      assert.equal(res.status, 400);
      assert.match(res.body.message, /eight characters/);
      assert.ok(await stillOpensWith(PASSWORD));
    });

    await t.test("and the one you already have", async () => {
      const cookie = await signedUp();
      const res = await change(cookie, PASSWORD, PASSWORD);

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "That is already your password.");
    });

    // The point of asking: a session left open on someone else's screen
    // cannot be used to lock the owner out.
    await t.test("needs the current one to be right", async () => {
      const cookie = await signedUp();
      const res = await change(cookie, "Wr0ngpassword", "N3wpassword");

      assert.equal(res.status, 403);
      assert.equal(res.body.message, "Your current password is incorrect.");
      assert.ok(await stillOpensWith(PASSWORD));
      assert.ok(!(await stillOpensWith("N3wpassword")));
    });

    await t.test(
      "then the new one opens it and the old one doesn't",
      async () => {
        const cookie = await signedUp();
        const res = await change(cookie, PASSWORD, "N3wpassword");

        assert.equal(res.status, 200);
        assert.equal(res.body.message, "Password changed.");
        assert.ok(await stillOpensWith("N3wpassword"));
        assert.ok(!(await stillOpensWith(PASSWORD)));
      }
    );

    // Usually changed because somebody else knows the old one - so they are
    // signed out wherever they are. Not here, though: being signed out of the
    // device you just changed it on reads as the change having failed.
    await t.test("signing out everywhere else, but not here", async () => {
      const here = await signedUp();
      const elsewhere = (await signIn("pat", PASSWORD)).cookie;
      assert.equal((await whoAmI(elsewhere)).status, 200);

      const res = await change(here, PASSWORD, "N3wpassword");

      assert.equal(res.status, 200);
      assert.equal(
        res.body.message,
        "Password changed. You have been signed out everywhere else."
      );
      forgetAll();
      assert.equal((await whoAmI(elsewhere)).status, 401);
      assert.equal((await whoAmI(here)).status, 200);
    });
  });

  await t.test("resetting a password from the emailed link", async (t) => {
    const TOKEN = "a".repeat(80);

    // The link as forgotPassword leaves it: the token stored hashed, with an
    // hour to run unless told otherwise.
    const linkSent = async ({ expires = Date.now() + 60 * 60 * 1000 } = {}) => {
      const cookie = await signedUp();
      await db.User.updateOne(
        { username: "pat" },
        {
          $set: {
            resetPassToken: crypto
              .createHash("sha256")
              .update(TOKEN)
              .digest("hex"),
            tokenExpiration: expires,
          },
        }
      );
      return cookie;
    };

    const reset = (token, password) =>
      call("/api/auth/reset", { token, password });

    const tokenLeft = async () =>
      Boolean(
        (await db.User.findOne({ username: "pat" }).select("+resetPassToken"))
          .resetPassToken
      );

    await t.test("needs a token", async () => {
      await linkSent();
      const res = await reset("", "N3wpassword");

      assert.equal(res.status, 422);
    });

    await t.test("one that matches somebody", async () => {
      await linkSent();
      const res = await reset("b".repeat(80), "N3wpassword");

      assert.equal(res.status, 422);
      assert.equal((await signIn("pat", PASSWORD)).status, 200);
    });

    await t.test("and is still in date", async () => {
      await linkSent({ expires: Date.now() - 1000 });
      const res = await reset(TOKEN, "N3wpassword");

      assert.equal(res.status, 422);
      assert.equal(res.body.message, "Password reset link has expired!");
      assert.equal((await signIn("pat", PASSWORD)).status, 200);
    });

    // Refused for the password, not the link - so the link still works for
    // the second try, rather than sending them back for another email.
    await t.test("a weak password is refused and the link kept", async () => {
      await linkSent();
      const res = await reset(TOKEN, WEAK);

      assert.equal(res.status, 400);
      assert.ok(await tokenLeft());
    });

    await t.test("then it works once, and only once", async () => {
      await linkSent();

      const first = await reset(TOKEN, "N3wpassword");
      const again = await reset(TOKEN, "An0therone");

      assert.equal(first.status, 200);
      assert.equal(again.status, 422);
      assert.ok(!(await tokenLeft()));
      assert.equal((await signIn("pat", "N3wpassword")).status, 200);
      assert.equal((await signIn("pat", PASSWORD)).status, 401);
    });

    // The path somebody takes when they have lost control of the account,
    // so every session goes - there is no device of theirs to keep.
    await t.test("and signs the account out everywhere", async () => {
      const cookie = await linkSent();
      assert.equal((await whoAmI(cookie)).status, 200);

      await reset(TOKEN, "N3wpassword");
      forgetAll();

      assert.equal((await whoAmI(cookie)).status, 401);
    });
  });
});

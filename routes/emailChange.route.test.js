// Changing your email: asked for signed in, confirmed from the new inbox.
//
// UX audit finding #23. You could change your username, team and password but
// not your email - and password reset goes to your email. The change is held
// as pending until the link sent to the new address is opened, the current
// password is asked for, and the old address is told.
//
// The real session, passport and auth routes against a real MongoDB. The
// mailer is stood in for before the routes load, so nothing is sent: what each
// case records is who would have been mailed, and with what.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const mailer = require("../utils/nodeMailer");
const sent = [];
let mailFails = false;
mailer.verifyMailer = async () => true;
mailer.sendEmailConfirm = async (to, token) => {
  if (mailFails) throw new Error("provider refused");
  sent.push({ kind: "confirm", to, token });
};
mailer.sendEmailChangeNotice = async (to, newEmail) => {
  if (mailFails) throw new Error("provider refused");
  sent.push({ kind: "notice", to, newEmail });
};

const db = require("../models");
const passport = require("../config/passport");
const { sessionMiddleware } = require("../config/session");

const URI =
  process.env.EMAIL_CHANGE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-email-change";

const PASSWORD = "Passw0rd1";

test("changing your email", async (t) => {
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

  let address = 0;
  const call = async (path, body, cookie) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `192.0.2.${(++address % 250) + 1}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body || {}),
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

  // A fresh account, signed in. Registering signs you in.
  const setUp = async () => {
    await db.User.deleteMany({});
    sent.length = 0;
    mailFails = false;
    const res = await call("/api/auth/register", {
      username: "pat",
      email: "pat@old.test",
      password: PASSWORD,
      firstName: "Pat",
      lastName: "Change",
    });
    assert.equal(res.status, 201);
    return res.cookie;
  };

  const stored = () =>
    db.User.findOne({ username: "pat" }).select(
      "+pendingEmail +emailChangeToken +emailChangeExpires +resetPassToken"
    );

  const ask = (cookie, email, password = PASSWORD) =>
    call("/api/auth/email", { email, password }, cookie);

  const confirmToken = () => sent.find((m) => m.kind === "confirm").token;

  await t.test("asking sends a link to the new address", async () => {
    const cookie = await setUp();

    const res = await ask(cookie, "Pat@New.test");

    assert.equal(res.status, 200);
    assert.equal(res.body.pendingEmail, "pat@new.test");
    const confirm = sent.find((m) => m.kind === "confirm");
    assert.equal(confirm.to, "pat@new.test");
    assert.match(confirm.token, /^[0-9a-f]{80}$/);
  });

  // The owner's warning, if it wasn't them.
  await t.test(
    "and tells the old address what it is being changed to",
    async () => {
      const cookie = await setUp();

      await ask(cookie, "pat@new.test");

      assert.deepEqual(
        sent.find((m) => m.kind === "notice"),
        { kind: "notice", to: "pat@old.test", newEmail: "pat@new.test" }
      );
    }
  );

  // A typo in the new address must not lock anybody out.
  await t.test("but changes nothing until the link is opened", async () => {
    const cookie = await setUp();

    await ask(cookie, "pat@new.test");
    const user = await stored();

    assert.equal(user.email, "pat@old.test");
    assert.equal(user.pendingEmail, "pat@new.test");
    // Stored hashed, as reset tokens are.
    assert.notEqual(user.emailChangeToken, confirmToken());
    assert.equal(
      user.emailChangeToken,
      crypto.createHash("sha256").update(confirmToken()).digest("hex")
    );
  });

  await t.test("the current password is needed", async () => {
    const cookie = await setUp();

    const wrong = await ask(cookie, "pat@new.test", "Wr0ngpassword");
    const none = await ask(cookie, "pat@new.test", "");

    assert.equal(wrong.status, 403);
    assert.equal(none.status, 400);
    assert.equal(sent.length, 0);
    assert.equal((await stored()).pendingEmail, undefined);
  });

  await t.test("signed out, nobody can ask", async () => {
    await setUp();

    const res = await ask(null, "pat@new.test");

    assert.equal(res.status, 401);
    assert.equal(sent.length, 0);
  });

  await t.test("the new address has to be an address", async () => {
    const cookie = await setUp();

    const res = await ask(cookie, "not an address");

    assert.equal(res.status, 400);
    assert.equal(sent.length, 0);
  });

  await t.test("and not the one you have", async () => {
    const cookie = await setUp();

    const res = await ask(cookie, "PAT@old.test");

    assert.equal(res.status, 400);
    assert.match(res.body.message, /already your email/);
  });

  await t.test("nor somebody else's", async () => {
    const cookie = await setUp();
    await db.User.create({
      username: "sam",
      email: "sam@taken.test",
      password: "x",
      firstName: "Sam",
      lastName: "Other",
    });

    const res = await ask(cookie, "sam@taken.test");

    assert.equal(res.status, 400);
    assert.match(res.body.message, /already in use/);
    assert.equal(sent.length, 0);
  });

  // A link that never went out is not left waiting to be confirmed.
  await t.test("mail that can't be sent leaves nothing pending", async () => {
    const cookie = await setUp();
    mailFails = true;

    const res = await ask(cookie, "pat@new.test");

    assert.equal(res.status, 503);
    const user = await stored();
    assert.equal(user.pendingEmail, undefined);
    assert.equal(user.emailChangeToken, undefined);
  });

  await t.test("opening the link makes the change", async () => {
    const cookie = await setUp();
    await ask(cookie, "pat@new.test");

    const res = await call("/api/auth/email/confirm", {
      token: confirmToken(),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.email, "pat@new.test");
    const user = await stored();
    assert.equal(user.email, "pat@new.test");
    assert.equal(user.pendingEmail, undefined);
    assert.equal(user.emailChangeToken, undefined);
  });

  // It is the address you sign in with.
  await t.test(
    "and the new address signs in; the old one doesn't",
    async () => {
      const cookie = await setUp();
      await ask(cookie, "pat@new.test");
      await call("/api/auth/email/confirm", { token: confirmToken() });

      const byNew = await call("/api/auth/login", {
        email: "pat@new.test",
        password: PASSWORD,
      });
      const byOld = await call("/api/auth/login", {
        email: "pat@old.test",
        password: PASSWORD,
      });

      assert.equal(byNew.status, 200);
      assert.equal(byOld.status, 401);
    }
  );

  await t.test("a link works once", async () => {
    const cookie = await setUp();
    await ask(cookie, "pat@new.test");
    const token = confirmToken();

    await call("/api/auth/email/confirm", { token });
    const again = await call("/api/auth/email/confirm", { token });

    assert.equal(again.status, 422);
  });

  await t.test("and not after it expires", async () => {
    const cookie = await setUp();
    await ask(cookie, "pat@new.test");
    await db.User.updateOne(
      { username: "pat" },
      { $set: { emailChangeExpires: Date.now() - 1000 } }
    );

    const res = await call("/api/auth/email/confirm", {
      token: confirmToken(),
    });

    assert.equal(res.status, 422);
    assert.equal((await stored()).email, "pat@old.test");
  });

  // An hour is long enough for somebody else to register it.
  await t.test(
    "an address taken since the link was sent isn't taken over",
    async () => {
      const cookie = await setUp();
      await ask(cookie, "pat@new.test");
      await db.User.create({
        username: "quick",
        email: "pat@new.test",
        password: "x",
        firstName: "Quick",
        lastName: "Other",
      });

      const res = await call("/api/auth/email/confirm", {
        token: confirmToken(),
      });

      assert.equal(res.status, 409);
      assert.equal((await stored()).email, "pat@old.test");
    }
  );

  // A reset link sent to the old address stops working with it.
  await t.test(
    "the change ends a reset waiting at the old address",
    async () => {
      const cookie = await setUp();
      await db.User.updateOne(
        { username: "pat" },
        {
          $set: {
            resetPassToken: "pending",
            tokenExpiration: Date.now() + 60000,
          },
        }
      );
      await ask(cookie, "pat@new.test");

      await call("/api/auth/email/confirm", { token: confirmToken() });

      assert.equal((await stored()).resetPassToken, undefined);
    }
  );

  await t.test("a token that isn't a token confirms nothing", async () => {
    const cookie = await setUp();
    await ask(cookie, "pat@new.test");

    const operator = await call("/api/auth/email/confirm", {
      token: { $ne: null },
    });
    const wrong = await call("/api/auth/email/confirm", {
      token: "0".repeat(80),
    });

    assert.equal(operator.status, 422);
    assert.equal(wrong.status, 422);
    assert.equal((await stored()).email, "pat@old.test");
  });

  // Asking again replaces the first request; its link stops working.
  await t.test("asking again replaces the first request", async () => {
    const cookie = await setUp();
    await ask(cookie, "pat@first.test");
    const first = confirmToken();
    sent.length = 0;
    await ask(cookie, "pat@second.test");

    const old = await call("/api/auth/email/confirm", { token: first });
    const latest = await call("/api/auth/email/confirm", {
      token: confirmToken(),
    });

    assert.equal(old.status, 422);
    assert.equal(latest.status, 200);
    assert.equal((await stored()).email, "pat@second.test");
  });
});

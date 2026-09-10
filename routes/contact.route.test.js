// The contact form's route.
//
//   npm test
//
// No database: this route reads nothing and writes nothing. What it does is
// take a stranger's input, refuse most of it, and spend a send on the rest -
// so the tests are about what it refuses and what it hands the mailer.
//
// The mailer is stubbed by replacing the exports on the required module, which
// works because routes/contact.js calls mailer.sendContactMessage() rather than
// destructuring it at import time. Sending real mail from a test suite is not a
// thing to arrange by accident.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const mailer = require("../utils/nodeMailer");

const VALID = {
  name: "Ann Tipper",
  email: "ann@example.test",
  subject: "Locked out",
  message: "The reset email never arrived and I cannot sign in.",
};

test("POST /api/contact", async (t) => {
  const realSend = mailer.sendContactMessage;
  const realConfigured = mailer.isConfigured;

  let sent = [];
  let configured = true;
  let sendFails = null;

  mailer.isConfigured = () => configured;
  mailer.sendContactMessage = async (submission) => {
    if (sendFails) throw new Error(sendFails);
    sent.push(submission);
    return { messageId: "stub" };
  };

  t.after(() => {
    mailer.sendContactMessage = realSend;
    mailer.isConfigured = realConfigured;
  });

  // Trusting one proxy hop, so each case can present its own client address
  // through X-Forwarded-For. The limiter is real and mounted - five an hour
  // from one address - and without a fresh address per case the sixth request
  // in this file would be refused for the wrong reason.
  //
  // Tested through rather than around: a backdoor that switches off the thing
  // guarding the inbox is not something to add for the convenience of a test.
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/contact", require("./contact"));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // A fresh address per call unless one is named, so cases do not spend each
  // other's allowance.
  let caller = 0;
  const post = async (body, from) => {
    const ip = from || `203.0.113.${(caller += 1) % 250}`;
    const res = await fetch(`${base}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, body: json, raw: text };
  };

  const reset = () => {
    sent = [];
    configured = true;
    sendFails = null;
  };

  // --- what gets through -------------------------------------------------

  await t.test("a complete message is sent", async () => {
    reset();
    const res = await post(VALID);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], VALID);
  });

  await t.test("the subject is optional", async () => {
    reset();
    const res = await post({ ...VALID, subject: undefined });

    assert.equal(res.status, 200);
    assert.equal(sent[0].subject, "");
  });

  // Trimmed before it is judged, so a field holding only spaces is empty
  // rather than valid - and the name in the mail is not padded.
  await t.test("whitespace is trimmed, not accepted as content", async () => {
    reset();
    const res = await post({ ...VALID, name: "  Ann  " });

    assert.equal(res.status, 200);
    assert.equal(sent[0].name, "Ann");

    assert.equal((await post({ ...VALID, message: "   " })).status, 400);
  });

  // --- what does not ------------------------------------------------------

  await t.test("every required field is required", async () => {
    reset();

    for (const field of ["name", "email", "message"]) {
      const res = await post({ ...VALID, [field]: "" });
      assert.equal(res.status, 400, `${field} was accepted empty`);
    }

    assert.equal(sent.length, 0, "nothing was sent");
  });

  await t.test("an address that cannot be replied to is refused", async () => {
    reset();

    for (const email of ["ann", "ann@", "@example.test", "ann example.test"]) {
      assert.equal((await post({ ...VALID, email })).status, 400, email);
    }

    assert.equal(sent.length, 0);
  });

  // A cap on every field, because the message is a stranger's and the inbox is
  // ours. The 4000 is generous for a real problem described properly.
  await t.test("an oversized message is refused", async () => {
    reset();

    const res = await post({ ...VALID, message: "x".repeat(4001) });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /4000/);

    assert.equal((await post({ ...VALID, name: "x".repeat(81) })).status, 400);
    assert.equal((await post({ ...VALID, subject: "x".repeat(121) })).status, 400);
    assert.equal(sent.length, 0);
  });

  await t.test("a body that is not an object does not throw", async () => {
    reset();

    const res = await fetch(`${base}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.251",
      },
      body: JSON.stringify(null),
    });

    assert.equal(res.status, 400);
  });

  // --- when sending cannot work ------------------------------------------

  // Said plainly rather than reported as a delivery failure for something that
  // was never going to be delivered.
  await t.test("no mail configured is its own answer", async () => {
    reset();
    configured = false;

    const res = await post(VALID);

    assert.equal(res.status, 503);
    assert.equal(sent.length, 0);
  });

  // The provider's own words name our sending address and our account state.
  // They belong in the log, not in an answer to a stranger.
  await t.test("a provider failure does not quote the provider", async () => {
    reset();
    sendFails = "Brevo API 401: sender daniel@twintips.example is not verified";

    const res = await post(VALID);

    assert.equal(res.status, 502);
    assert.equal(res.body.success, false);
    assert.equal(res.raw.includes("Brevo"), false);
    assert.equal(res.raw.includes("not verified"), false);
    assert.equal(res.raw.includes("@"), false, "no address of ours either");
  });

  // --- the limit itself ---------------------------------------------------

  // The reason it exists: this route sends mail on every success, to a fixed
  // address, for anyone who finds the URL. Unlimited it is a way to fill one
  // inbox from outside at whatever rate the caller likes.
  await t.test("a sixth message in the hour is refused", async () => {
    reset();
    const flooder = "198.51.100.7";

    for (let i = 0; i < 5; i += 1) {
      assert.equal((await post(VALID, flooder)).status, 200, "message " + (i + 1));
    }

    const sixth = await post(VALID, flooder);
    assert.equal(sixth.status, 429);
    assert.equal(sent.length, 5, "the sixth was never handed to the mailer");
  });

  // Per address, so one flooder does not shut the form for everybody else.
  await t.test("and somebody else can still get through", async () => {
    const res = await post(VALID, "198.51.100.8");
    assert.equal(res.status, 200);
  });

  server.close();
});

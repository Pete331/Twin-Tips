// What a contact message actually puts on the wire.
//
//   npm test
//
// The route decides whether to send; this decides what is sent, and two of the
// decisions are the sort that look fine until they are not:
//
//   - The envelope sender is ours, never the visitor's. Sending as them would
//     fail SPF at best and be spoofing at worst, and Brevo refuses an
//     unverified sender outright - so the form would simply stop working. Their
//     address goes in replyTo, which is what makes replying work anyway.
//   - The body is plain text. It is whatever a stranger typed, and putting that
//     into an HTML email is an injection into our own inbox. Text has nothing
//     to escape.
//
// The environment is set before the module is required, because nodeMailer
// reads it once at load. Its own process, which the node runner gives every
// file, so this cannot leak into another suite.

process.env.BREVO_API_KEY = "test-key-not-a-real-one";
process.env.MAIL_FROM = "noreply@twintips.test";
process.env.CONTACT_TO = "inbox@twintips.test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { sendContactMessage } = require("./nodeMailer");

const VISITOR = {
  name: "Ann Tipper",
  email: "ann@example.test",
  subject: "Locked out",
  message: "The reset email never arrived.",
};

// Captures the Brevo call instead of making it.
const capture = async (submission) => {
  const realFetch = global.fetch;
  let sent = null;

  global.fetch = async (url, options) => {
    sent = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ messageId: "stub" }),
      text: async () => "",
    };
  };

  try {
    await sendContactMessage(submission);
  } finally {
    global.fetch = realFetch;
  }

  return sent;
};

test("the message is sent from us and replies go to them", async () => {
  const { url, body } = await capture(VISITOR);

  assert.match(url, /api\.brevo\.com\/v3\/smtp\/email$/);

  assert.equal(body.sender.email, "noreply@twintips.test");
  assert.notEqual(
    body.sender.email,
    VISITOR.email,
    "the visitor must never be the envelope sender"
  );

  assert.equal(body.replyTo.email, VISITOR.email);
  assert.equal(body.replyTo.name, VISITOR.name);
});

test("it goes to the contact address", async () => {
  const { body } = await capture(VISITOR);

  assert.deepEqual(body.to, [{ email: "inbox@twintips.test" }]);
});

// Plain text, so there is no markup for a stranger's message to become part of.
test("the body is text, not HTML", async () => {
  const { body } = await capture({
    ...VISITOR,
    message: "<script>alert(1)</script> and <b>bold</b>",
  });

  assert.equal(body.htmlContent, undefined);
  assert.ok(body.textContent.includes("<script>alert(1)</script>"));
});

test("the message carries who it is from and what they said", async () => {
  const { body } = await capture(VISITOR);

  assert.ok(body.textContent.includes(VISITOR.name));
  assert.ok(body.textContent.includes(VISITOR.email));
  assert.ok(body.textContent.includes(VISITOR.message));
});

test("the subject names the app and the visitor's own subject", async () => {
  const { body } = await capture(VISITOR);

  assert.ok(body.subject.includes("Twin Tips"));
  assert.ok(body.subject.includes("Locked out"));
});

// The subject is optional on the form, so the heading has to stand without it.
test("no subject still gives the mail a heading", async () => {
  const { body } = await capture({ ...VISITOR, subject: "" });

  assert.equal(body.subject, "Twin Tips contact");
  assert.ok(!body.textContent.includes("Subject:"));
});

// A failure is thrown rather than swallowed, for the reason sendMail documents:
// nothing here may decide on the sender's behalf that their message not
// arriving did not matter.
test("a refused send throws rather than reporting success", async () => {
  const realFetch = global.fetch;

  global.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => '{"message":"sender not verified"}',
  });

  try {
    await assert.rejects(() => sendContactMessage(VISITOR), /401/);
  } finally {
    global.fetch = realFetch;
  }
});

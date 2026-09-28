// What the password reset email actually puts on the wire.
//
// The email showed a broken image labelled "Logo" at the top: it pointed at a
// logo.png on GitHub that no longer exists. And it put the first name into its
// markup as typed. Both are checked here on the message Brevo would be sent.
//
// The environment is set before the module is required, because nodeMailer
// reads it once at load. Its own process, which the node runner gives every
// file, so this cannot leak into another suite.

process.env.BREVO_API_KEY = "test-key-not-a-real-one";
process.env.MAIL_FROM = "noreply@twintips.test";
process.env.APP_URL = "https://tips.example.test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { sendMail } = require("./nodeMailer");

// Captures the Brevo call instead of making it.
const capture = async (send) => {
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
    await send();
  } finally {
    global.fetch = realFetch;
  }

  return sent;
};

const TOKEN = "f".repeat(80);

test("it goes to the address asked for, with the reset subject", async () => {
  const { url, body } = await capture(() =>
    sendMail("pat@example.test", TOKEN, "Pat")
  );

  assert.match(url, /api\.brevo\.com\/v3\/smtp\/email$/);
  assert.deepEqual(body.to, [{ email: "pat@example.test" }]);
  assert.equal(body.subject, "Password Reset");
  assert.equal(body.sender.email, "noreply@twintips.test");
});

test("the link is this app's reset page, with the token", async () => {
  const { body } = await capture(() =>
    sendMail("pat@example.test", TOKEN, "Pat")
  );

  assert.ok(
    body.htmlContent.includes(`https://tips.example.test/reset/${TOKEN}`)
  );
});

// It pointed at a file that no longer exists.
test("the logo is the app's own icon, served by the app", async () => {
  const { body } = await capture(() =>
    sendMail("pat@example.test", TOKEN, "Pat")
  );

  assert.ok(
    body.htmlContent.includes(
      'src="https://tips.example.test/assets/icon-192.png"'
    )
  );
  assert.ok(!body.htmlContent.includes("github.com"));
  assert.ok(!body.htmlContent.includes('alt="Logo"'));
});

test("the name is greeted as text, not markup", async () => {
  const { body } = await capture(() =>
    sendMail("pat@example.test", TOKEN, '<a href="x">Pat</a>')
  );

  assert.ok(body.htmlContent.includes("Hi &lt;a href=&quot;x&quot;&gt;Pat"));
  assert.ok(!body.htmlContent.includes('<a href="x">'));
});

// The old template closed a footer it never opened. Counted rather than
// parsed: every table opened is closed.
test("the markup opens as many tables as it closes", async () => {
  const { body } = await capture(() =>
    sendMail("pat@example.test", TOKEN, "Pat")
  );

  const opened = (body.htmlContent.match(/<table\b/g) || []).length;
  const closed = (body.htmlContent.match(/<\/table>/g) || []).length;
  assert.equal(opened, closed);
});

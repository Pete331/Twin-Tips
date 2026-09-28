// What the two email-change messages put on the wire (UX audit finding #23).
//
// The link goes to the new address only. The notice to the old one says what
// is happening and carries no link: whoever reads the old inbox must not be
// able to finish somebody else's change from it.
//
// The environment is set before the module is required, because nodeMailer
// reads it once at load. Its own process, which the node runner gives every
// file, so this cannot leak into another suite.

process.env.BREVO_API_KEY = "test-key-not-a-real-one";
process.env.MAIL_FROM = "noreply@twintips.test";
process.env.APP_URL = "https://tips.example.test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { sendEmailConfirm, sendEmailChangeNotice } = require("./nodeMailer");

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

const TOKEN = "c".repeat(80);

test("the link goes to the new address, and opens the confirm page", async () => {
  const { body } = await capture(() =>
    sendEmailConfirm("pat@new.test", TOKEN, "Pat")
  );

  assert.deepEqual(body.to, [{ email: "pat@new.test" }]);
  assert.equal(body.subject, "Confirm your new email");
  assert.ok(
    body.htmlContent.includes(
      `https://tips.example.test/confirm-email/${TOKEN}`
    )
  );
  assert.ok(body.htmlContent.includes("works for 1 hour"));
});

test("the notice goes to the old address and names the new one", async () => {
  const { body } = await capture(() =>
    sendEmailChangeNotice("pat@old.test", "pat@new.test", "Pat")
  );

  assert.deepEqual(body.to, [{ email: "pat@old.test" }]);
  assert.equal(body.subject, "Your Twin Tips email is being changed");
  assert.ok(body.htmlContent.includes("pat@new.test"));
});

// Whoever reads the old inbox must not be able to finish the change.
test("the notice carries no link to confirm it", async () => {
  const { body } = await capture(() =>
    sendEmailChangeNotice("pat@old.test", "pat@new.test", "Pat")
  );

  assert.ok(!body.htmlContent.includes("/confirm-email/"));
  assert.ok(!body.htmlContent.includes(TOKEN));
});

test("what a person typed is text in both", async () => {
  const confirm = await capture(() =>
    sendEmailConfirm("pat@new.test", TOKEN, "<b>Pat</b>")
  );
  const notice = await capture(() =>
    sendEmailChangeNotice("pat@old.test", "<i>x</i>@new.test", "<b>Pat</b>")
  );

  assert.ok(!confirm.body.htmlContent.includes("<b>Pat</b>"));
  assert.ok(!notice.body.htmlContent.includes("<b>Pat</b>"));
  assert.ok(!notice.body.htmlContent.includes("<i>x</i>"));
  assert.ok(notice.body.htmlContent.includes("&lt;i&gt;x&lt;/i&gt;"));
});

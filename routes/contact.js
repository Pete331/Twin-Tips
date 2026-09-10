// The contact form.
//
// Deliberately open, which is the whole point of it. Every other way of
// reaching us is inside the app, and the one person who most needs to get in
// touch is the one who cannot sign in - a reset mail that never arrived, a
// token that expired, the wrong address on the account. A support route behind
// requireAuth would be shut to exactly them.
//
// Open also means it sends mail on behalf of a stranger, so it is rate limited
// like /forgot and validated before it spends anything.

const express = require("express");
const router = express.Router();
const { contactLimiter } = require("../middleware/rateLimit");
const mailer = require("../utils/nodeMailer");

// Long enough for a real problem described properly, short enough that the
// field is not a place to paste a novel into somebody's inbox.
const LIMITS = {
  name: 80,
  email: 254, // the maximum length of an address, per RFC 5321
  subject: 120,
  message: 4000,
};

// The same shape the client checks. Deliberately loose: the only thing that
// proves an address works is mail arriving at it, and a stricter pattern would
// mostly reject unusual but legal addresses.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asText = (value) => (typeof value === "string" ? value.trim() : "");

// What is wrong with the submission, or null.
//
// Returns the first fault rather than a list: the form marks one field at a
// time, and a wall of complaints about a message somebody has already typed
// once is not kinder for being complete.
const faultIn = ({ name, email, subject, message }) => {
  if (!name) return "Please tell us your name.";
  if (name.length > LIMITS.name) return "That name is too long.";

  if (!email) return "Please give us an email address to reply to.";
  if (email.length > LIMITS.email || !EMAIL.test(email)) {
    return "Please enter a valid email address.";
  }

  if (subject.length > LIMITS.subject) return "That subject is too long.";

  if (!message) return "Please tell us what you need help with.";
  if (message.length > LIMITS.message) {
    return `Please keep the message under ${LIMITS.message} characters.`;
  }

  return null;
};

// @route  POST /api/contact
// @desc   Send a message from the contact form
// @access Public, rate limited
router.post("/", contactLimiter, async (req, res) => {
  const submission = {
    name: asText(req.body && req.body.name),
    email: asText(req.body && req.body.email),
    subject: asText(req.body && req.body.subject),
    message: asText(req.body && req.body.message),
  };

  const fault = faultIn(submission);
  if (fault) {
    return res.status(400).json({ success: false, message: fault });
  }

  // Checked before sending rather than after failing, so a deployment with no
  // mail configured says so plainly instead of reporting a delivery error for
  // something that was never going to be delivered.
  if (!mailer.isConfigured()) {
    console.error("contact form: mail is not configured");
    return res.status(503).json({
      success: false,
      message:
        "We cannot send messages right now. Please try again later.",
    });
  }

  try {
    await mailer.sendContactMessage(submission);

    res.status(200).json({
      success: true,
      message: "Thanks - your message is on its way. We will reply by email.",
    });
  } catch (err) {
    // The provider's own words stay in the log and out of the response. They
    // name our sending address and our account state, which is nobody else's
    // business and no help to the person who just wanted to ask a question.
    console.error("contact form send failed:", err.message);

    res.status(502).json({
      success: false,
      message:
        "Your message could not be sent. Please try again in a few minutes.",
    });
  }
});

module.exports = router;

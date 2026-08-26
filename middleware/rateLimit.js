// Rate limits for the routes an anonymous visitor can reach.
//
// Everything else is behind requireAuth, so the account is the constraint.
// These three are open to anyone who finds the URL:
//
//   login    - an eight character minimum with no lockout is brute-forceable.
//   register - creating accounts in bulk.
//   forgot   - the sharp one. Each request sends mail from our own Gmail
//              account to an address the caller chooses, so without a limit it
//              is a way to have us deliver mail on someone else's behalf, at
//              whatever rate they like, until the account is suspended.
//
// Counting is per IP, which needs the client address to be right - server.js
// sets trust proxy in production so Render's forwarded address is used rather
// than the proxy's own.

const { rateLimit } = require("express-rate-limit");

const MINUTE = 60 * 1000;

const message = (text) => ({ success: false, message: text });

// Generous enough that a person mistyping a password never meets it.
const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Only failures count, so someone signing in repeatedly on a shared address
  // - a household, an office - is not locked out by their own success.
  skipSuccessfulRequests: true,
  message: message(
    "Too many sign-in attempts. Please wait a few minutes and try again."
  ),
});

const registerLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many accounts created. Please try again later."),
});

// Tightest of the three: this one sends email.
const forgotLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message(
    "Too many reset requests. Please wait an hour and try again."
  ),
});

module.exports = { loginLimiter, registerLimiter, forgotLimiter };

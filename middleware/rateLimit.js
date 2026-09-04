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

// The other half of the reset flow. /forgot was limited and this was not.
//
// Not because the token can be guessed - it is 40 bytes from a CSPRNG, and
// nothing in a rate limit is what stops that being brute-forced. It is that
// this route is open to anyone who finds it, it does a bcrypt hash on any
// request carrying a plausible-looking password, and an unlimited endpoint that
// hashes on demand is a way to spend the server's CPU from outside.
//
// Looser than /forgot, which sends mail. Somebody genuinely resetting a
// password may well get the rules wrong two or three times.
const resetLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many attempts. Please wait and try again."),
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

// The two league routes an authenticated stranger can hammer. Everything else
// under /api/leagues either reads a league they belong to or acts on one they
// administer, so the account is already the constraint.

// Anyone can create a league, so nothing but this stands between the
// collection and a script. Generous for a person naming a competition.
const leagueCreateLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many leagues created. Please try again later."),
});

// The join code is four characters from a 25-letter alphabet - around 390,000
// combinations, which is plenty against a person and nothing against a loop.
// The invite token cannot be guessed at all; this limit exists for the code.
const joinLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Only failures count, so joining several leagues in one sitting is not
  // stopped by its own success.
  skipSuccessfulRequests: true,
  message: message("Too many attempts. Please wait a few minutes."),
});

module.exports = {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  resetLimiter,
  leagueCreateLimiter,
  joinLimiter,
};

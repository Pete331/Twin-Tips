// The username rules, in one place. The client checks them so the form can say
// what is wrong before a round trip, and the server checks them again because
// the client is not the only thing that can post to /api/auth/register.
//
// client/src/utils/ValidationHelpers.js re-exports the same rule for the
// browser. Keep the two in step - the password rule below them drifted once
// already, and the message told people their password was invalid for a reason
// that was not true.

// Case-insensitive comparison, used by the unique index and by every lookup.
// MongoDB compares with a collation of strength 2, which ignores case; this is
// the equivalent for anything doing the comparison in JavaScript.
const USERNAME_COLLATION = { locale: "en", strength: 2 };

// No "@" is the rule that matters most. Sign-in takes one field for either a
// username or an email and decides which it is by looking for an "@", so a
// username containing one would be looked up as an email and never found.
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

const USERNAME_RULE =
  "Username must be 3-20 characters, using letters, numbers, underscores or hyphens only.";

const validUsername = (username) =>
  typeof username === "string" && USERNAME_PATTERN.test(username);

// Anything that would let one person impersonate another, or collide with a
// route. Compared lowercase because the index is case-insensitive.
const RESERVED = new Set([
  "admin",
  "administrator",
  "moderator",
  "root",
  "system",
  "support",
  "help",
  "twintips",
  "twin-tips",
  "login",
  "logout",
  "register",
  "settings",
  "dashboard",
  "leaderboard",
  "tipspage",
  "rulespage",
  "api",
  "me",
  "null",
  "undefined",
]);

const isReservedUsername = (username) =>
  RESERVED.has(String(username).toLowerCase());

module.exports = {
  USERNAME_COLLATION,
  USERNAME_PATTERN,
  USERNAME_RULE,
  validUsername,
  isReservedUsername,
};

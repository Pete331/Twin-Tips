// Backoff on failed sign-ins, per account.
//
// Beside the per-IP limiter in middleware/rateLimit.js, not instead of it
// (review finding #25). That one counts per address and in memory, so every
// deploy and every free-tier spin-down resets it, and it does nothing about
// guesses at one account spread across many addresses. This counts per
// identifier, in the database.
//
// The first five failures cost nothing - that is somebody mistyping. After
// that each further attempt has to wait: 30 seconds, doubling, to at most 15
// minutes. A success, or a password reset, clears it.
//
// Keyed on what was typed rather than on an account. An identifier that
// matches nobody is counted and made to wait exactly like one that matches
// somebody, and a waiting attempt is refused before the password is looked at,
// so neither the answer nor its timing says whether an account exists. The
// cost of that: a username and its email are counted separately.
//
// A backoff rather than a lockout, and the trade-off is worth knowing. While
// the wait runs even the right password is turned away - checking it would tell
// a guesser when they had hit - so somebody failing at another person's
// account on purpose can keep them out for up to 15 minutes at a time. The
// password reset is the way through: it clears the wait.

const db = require("../models");

const FREE_FAILURES = 5;
const FIRST_WAIT_MS = 30 * 1000;
const LONGEST_WAIT_MS = 15 * 60 * 1000;
const FORGET_AFTER_MS = 24 * 60 * 60 * 1000;

// The same person types the same identifier with different capitals and
// stray spaces; they are one key.
const keyFor = (identifier) => {
  const key = String(identifier || "")
    .trim()
    .toLowerCase();
  return key || null;
};

// How long after the latest failure the next attempt has to wait.
const waitAfter = (failures) =>
  failures < FREE_FAILURES
    ? 0
    : Math.min(
        FIRST_WAIT_MS * 2 ** (failures - FREE_FAILURES),
        LONGEST_WAIT_MS
      );

// Milliseconds still to wait before this identifier may try again; 0 if now.
const waitRemaining = async (key, now = new Date()) => {
  if (!key) return 0;
  const record = await db.LoginFailure.findOne({ key }).lean();
  if (!record) return 0;
  const until = record.lastAt.getTime() + waitAfter(record.count);
  return Math.max(0, until - now.getTime());
};

const recordFailure = async (key, now = new Date()) => {
  if (!key) return;
  await db.LoginFailure.updateOne(
    { key },
    {
      $inc: { count: 1 },
      $set: {
        lastAt: now,
        expiresAt: new Date(now.getTime() + FORGET_AFTER_MS),
      },
    },
    { upsert: true }
  );
};

// Every identifier somebody could type for one account.
const clearFor = async (...identifiers) => {
  const keys = identifiers.map(keyFor).filter(Boolean);
  if (keys.length) await db.LoginFailure.deleteMany({ key: { $in: keys } });
};

// How the wait is put to a person: whole minutes, or seconds under one.
const describeWait = (ms) => {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
};

module.exports = {
  keyFor,
  waitAfter,
  waitRemaining,
  recordFailure,
  clearFor,
  describeWait,
  FREE_FAILURES,
};

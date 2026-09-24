// The one work factor for every password hash, and the helpers around it.
//
// One place, because the places that hash have to agree. A sign-in compares
// against whatever cost the stored hash was made with, so they can drift
// apart without anything failing - and the drift shows up only as some
// accounts being cheaper to attack. The account-deletion route had drifted:
// it hashed its throwaway password at a literal 10 of its own.
//
// 12, up from 10 (review finding #25). 10 is OWASP's floor, and took ~70ms
// here; 12 is four times the work for anyone guessing offline, and ~250ms is
// still nothing to somebody signing in. Existing hashes stay at 10 until
// their owner next signs in, when they are made again at 12 (config/passport).
//
// bcrypt.hash(password, cost) generates its own salt, so there is no separate
// genSalt call whose error can be forgotten.

const bcrypt = require("bcrypt");

const BCRYPT_COST = 12;

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

// Whether a stored hash was made at less than today's cost. Anything that is
// not a bcrypt hash is left alone rather than thrown on - a test fixture's
// placeholder password, say - since there is no way to rehash it anyway.
const needsRehash = (hash) => {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return false;
  }
};

module.exports = { BCRYPT_COST, hashPassword, needsRehash };

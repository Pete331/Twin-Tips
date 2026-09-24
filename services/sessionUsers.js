// Who a session belongs to, remembered for a minute.
//
// Every signed-in request used to look its user up in the database to find
// out who was asking - one of three round trips, at ~155ms each from Render to
// Atlas, that recognising a user cost before a route did anything (review
// finding #27). A page load makes five such requests within a second or two,
// and they all asked the same question.
//
// Remembered here rather than copied into the session. A copy in the session
// would save the lookup entirely, but it is one copy per device, and nothing
// can reach the others: rename yourself on your phone and your laptop shows
// the old name until you sign out there, which on a rolling session might be
// never. A minute in this process's memory is forgotten on its own, and
// forgotten at once by the code that changes an account (forgetUser).
//
// What that leaves: the admin flag is only ever changed directly in the
// database, so taking it away takes up to a minute to bite. Account deletion
// also ends every session the account had (DELETE /api/deleteUser), so there
// is nothing left to recognise.

const db = require("../models");

const REMEMBER_MS = 60 * 1000;

// One entry per account at most, replaced rather than added to, so it cannot
// outgrow the number of accounts.
const remembered = new Map();

const forgetUser = (id) => {
  remembered.delete(String(id));
};

// Everything, for the tests.
const forgetAll = () => remembered.clear();

// The signed-in user for a session's id, or null if there is none to be.
//
// The shape is what req.user has always been. Frozen, because the same object
// is handed to every request for the next minute - a route that changed it
// would be changing it for everyone else's requests too.
const findSessionUser = async (id) => {
  const key = String(id);
  const now = Date.now();

  const hit = remembered.get(key);
  if (hit && hit.until > now) return hit.user;

  const user = await db.User.findById(id);

  // A session can outlive its user. And a deleted account is kept, with its
  // details overwritten, so that the rounds it played still add up - it is not
  // somebody who can be signed in.
  if (!user || user.deletedAt) {
    remembered.delete(key);
    return null;
  }

  const sessionUser = Object.freeze({
    id: user._id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    admin: user.admin,
  });

  remembered.set(key, { user: sessionUser, until: now + REMEMBER_MS });
  return sessionUser;
};

module.exports = { findSessionUser, forgetUser, forgetAll, REMEMBER_MS };

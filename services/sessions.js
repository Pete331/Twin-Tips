// Ending a user's other sessions.
//
// The point of changing a password is usually that somebody else knows the old
// one. Until now that did not remove them: the hash changed and every device
// already signed in stayed signed in, for the full thirty days of the rolling
// cookie. A reset link sent to someone locked out of their own account left the
// person who locked them out exactly where they were.
//
// connect-mongo stores the whole session as a JSON string in one field, so
// there is no `session.passport.user` to query on. The id is matched in that
// string to narrow the scan, and then each candidate is parsed to make sure -
// a substring match is a filter here, never the decision.

const mongoose = require("mongoose");

// The collection connect-mongo writes to. Set by its default rather than by us;
// if that is ever configured explicitly in server.js, it has to change here too.
const COLLECTION = "sessions";

// Hex only, which is what an ObjectId is. Anything else cannot be a user id and
// must not reach a regular expression.
const isObjectIdString = (value) => /^[0-9a-f]{24}$/i.test(String(value));

// Every session belonging to a user, except the one making the request.
//
// `keepSessionId` is the caller's own session: someone changing their password
// while signed in should stay signed in on the device they did it from. A reset
// happens signed out, so it passes nothing and every session goes.
const endOtherSessions = async (userId, keepSessionId = null) => {
  const id = String(userId);
  if (!isObjectIdString(id)) return { ended: 0, reason: "not a user id" };

  const collection = mongoose.connection.db.collection(COLLECTION);

  // Narrows the scan. passport serialises the user id as a bare string, so a
  // signed-in session contains "user":"<id>" somewhere in its JSON.
  const candidates = await collection
    .find({ session: { $regex: `"user":"${id}"` } })
    .toArray();

  const doomed = candidates.filter((row) => {
    if (keepSessionId && row._id === keepSessionId) return false;

    // The regex found the id somewhere in the string. This confirms it is
    // actually the session's user and not, say, a value inside some other
    // field that happens to contain the same characters.
    try {
      const parsed = JSON.parse(row.session);
      return String(parsed?.passport?.user) === id;
    } catch {
      return false;
    }
  });

  if (!doomed.length) return { ended: 0 };

  const result = await collection.deleteMany({
    _id: { $in: doomed.map((row) => row._id) },
  });

  return { ended: result.deletedCount ?? doomed.length };
};

module.exports = { endOtherSessions, isObjectIdString };

// A clock that can be moved, so the season paths can be looked at out of
// season - pre-season, a round open, the minutes before lockout, finals, the
// off-season - without waiting a year for each.
//
//   TIME_TRAVEL="2026-03-15T19:00" npm run start:prod
//
// Local only, and enforced rather than trusted: setting TIME_TRAVEL with
// NODE_ENV=production refuses to start. A time override that reached the live
// app would not be a display quirk. getSeasonState decides which round tips
// are filed against, so a faked clock in production files real tips against
// the wrong round, in the real database, for everyone at once.
//
// Deliberately narrow. Only getSeasonState reads this. The scheduled sync picks
// its season from new Date() directly and writes fixtures and results; reset
// tokens expire against Date.now(). Neither should ever be movable, so neither
// goes through here.

// An offset from real time, not a fixed instant. A frozen clock cannot show
// the thing most worth watching - the moment lockout arrives and the page
// flips - because the deadline never gets any closer. With an offset the fake
// clock ticks forward at the normal rate, so waiting two minutes really does
// leave two minutes less.
const parseOffset = (raw, realNow = Date.now()) => {
  if (!raw) return null;

  const target = new Date(raw);

  if (Number.isNaN(target.getTime())) {
    throw new Error(
      `TIME_TRAVEL is not a date this can read: "${raw}". ` +
        `Try an ISO 8601 value such as 2026-03-15T19:00 (local) ` +
        `or 2026-03-15T11:00:00Z (UTC).`
    );
  }

  return target.getTime() - realNow;
};

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const RAW = process.env.TIME_TRAVEL;

let offset = null;

if (RAW) {
  // Refuse to start rather than ignore it. Silently dropping the variable
  // would be worse: whoever set it would believe it had taken effect, and go
  // on to trust what the app showed them.
  if (IS_PRODUCTION) {
    throw new Error(
      "TIME_TRAVEL is set with NODE_ENV=production. The clock override is a " +
        "local testing tool and must never run against live data - it decides " +
        "which round tips are filed against. Unset TIME_TRAVEL, or unset " +
        "NODE_ENV if this really is a development machine."
    );
  }

  offset = parseOffset(RAW);

  console.warn(
    "\n" +
      "  ============================================================\n" +
      "   TIME TRAVEL ACTIVE - this server is pretending it is\n" +
      `   ${new Date(Date.now() + offset).toString()}\n` +
      "   Season, round and lockout are all derived from that.\n" +
      "  ============================================================\n"
  );
}

// Real time unless an override is in force, so every caller can use this
// without caring whether one is.
const now = () => new Date(Date.now() + (offset || 0));

const isActive = () => offset !== null;

module.exports = { now, isActive, parseOffset };

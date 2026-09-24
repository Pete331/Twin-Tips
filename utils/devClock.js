// A clock that can be moved, so the season paths can be looked at out of
// season - pre-season, a round open, the minutes before lockout, finals, the
// off-season - without waiting a year for each.
//
//   TIME_TRAVEL="2026-03-15T19:00+11:00" npm run start:prod
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
//
// The zone has to be written. A time without one was read in the machine's own
// zone, so round 4's published Melbourne bounce, 2026-04-02T19:30, meant 11:30Z
// on a Perth machine and 08:30Z on a Melbourne one: typing a fixture's time as
// published put a Perth developer three hours after the real bounce, with
// nothing to say so. A bare date is no better - JavaScript reads it as UTC
// midnight, which is neither zone anybody here means.
const ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

const parseOffset = (raw, realNow = Date.now()) => {
  if (!raw) return null;

  const target = new Date(raw);

  if (Number.isNaN(target.getTime())) {
    throw new Error(
      `TIME_TRAVEL is not a date this can read: "${raw}". ` +
        `Try an ISO 8601 value with its zone, such as ` +
        `2026-03-15T19:00+11:00 or 2026-03-15T08:00:00Z (UTC).`
    );
  }

  if (!ZONE.test(String(raw).trim())) {
    const time = String(raw).trim().includes("T")
      ? String(raw).trim()
      : `${String(raw).trim()}T19:30`;
    throw new Error(
      `TIME_TRAVEL "${raw}" has no time zone, so it would be read in this ` +
        `machine's own - two or three hours out from Melbourne on a Perth ` +
        `machine. ` +
        `Write the zone the time is in:\n` +
        `  ${time}+11:00   Melbourne, daylight saving (October to early April)\n` +
        `  ${time}+10:00   Melbourne, standard time\n` +
        `  ${time}+08:00   Perth\n` +
        `  ${time}Z        UTC`
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

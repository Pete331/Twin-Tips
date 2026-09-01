// When to spend a credit, and when not to.
//
// The Odds API's free tier is 500 credits a month and a credit is charged per
// market per region - bookmakers are free, so one call buys every Australian
// book. Asking for h2h in the au region costs one, which makes the budget a
// straight count of calls.
//
// Pure, and every function takes the clock rather than reading it, so the hours
// this is about can be tested without waiting for them.

// The window, in the competition's own time. Fifteen calls a day.
//
// 8am to 11pm is sixteen, which comes to 496 in a 31-day month - four credits
// from the ceiling, in a season that contains four 31-day months. One manual
// test and the month is capped. Dropping the 11pm poll costs nothing anybody
// was reading and buys 35 credits of headroom.
const FIRST_HOUR = 8;
const LAST_HOUR = 22;

// Render's cron runs in UTC. Melbourne is UTC+10 in winter and UTC+11 in
// summer, and the AFL season crosses both switchovers - early April and early
// October - so a window written as a UTC cron expression drifts by an hour
// halfway through the season and quietly changes the budget.
//
// Deciding the hour here against a named zone removes the problem: the job can
// fire hourly, as the season sync already does, and this says whether to call.
const TIME_ZONE = "Australia/Melbourne";

// The hour in a named zone, without pulling in a date library.
//
// Intl knows the offsets and their history, which is the whole reason to ask it
// rather than add ten hours and hope.
const hourIn = (now, timeZone = TIME_ZONE) => {
  const formatted = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(now);

  // en-AU renders midnight as "24" rather than "0" in some environments.
  const hour = Number(formatted);
  return hour === 24 ? 0 : hour;
};

const inWindow = (now, options = {}) => {
  const {
    timeZone = TIME_ZONE,
    firstHour = FIRST_HOUR,
    lastHour = LAST_HOUR,
  } = options;

  const hour = hourIn(now, timeZone);
  return hour >= firstHour && hour <= lastHour;
};

// Stop before the month runs dry.
//
// Every response carries x-requests-remaining. Below this the job stops calling
// and says so, which leaves enough credits to test a fix rather than waiting
// for the 1st. Credits reset monthly with no carryover, so a month spent early
// is a month with no odds at all.
const RESERVE = 20;

const hasQuota = (remaining, reserve = RESERVE) => {
  // Unknown means the header was missing - a first run, or a response shape
  // that changed. Proceeding is right: refusing to ever call because a header
  // was absent would be a worse failure than one extra request.
  if (remaining === null || remaining === undefined || remaining === "") {
    return true;
  }

  const left = Number(remaining);
  if (!Number.isFinite(left)) return true;

  return left > reserve;
};

// The one question the scheduled job asks. Returns a reason either way, so a
// run that did nothing still says why in the log rather than looking like a
// job that failed to start.
const shouldPoll = (now, { remaining, ...options } = {}) => {
  if (!inWindow(now, options)) {
    return {
      poll: false,
      reason: `outside the ${options.firstHour ?? FIRST_HOUR}:00-${
        options.lastHour ?? LAST_HOUR
      }:00 window in ${options.timeZone || TIME_ZONE}`,
    };
  }

  if (!hasQuota(remaining, options.reserve)) {
    return {
      poll: false,
      reason: `only ${remaining} credits left, holding ${
        options.reserve ?? RESERVE
      } in reserve`,
    };
  }

  return { poll: true, reason: "in window, quota available" };
};

// What a month of polling costs, for checking the budget without waiting a
// month to find out.
const monthlyCost = (days, options = {}) => {
  const { firstHour = FIRST_HOUR, lastHour = LAST_HOUR, markets = 1, regions = 1 } = options;
  const callsPerDay = Math.max(0, lastHour - firstHour + 1);
  return callsPerDay * days * markets * regions;
};

module.exports = {
  hourIn,
  inWindow,
  hasQuota,
  shouldPoll,
  monthlyCost,
  FIRST_HOUR,
  LAST_HOUR,
  TIME_ZONE,
  RESERVE,
};

// When to spend a credit, and when not to.
//
// The Odds API's free tier is 500 credits a month and a credit is charged per
// market per region - bookmakers are free, so one call buys every Australian
// book. Asking for h2h and spreads in the au region costs two - measured from
// x-requests-last, not assumed - so the budget is twice the count of calls.
//
// Pure, and every function takes the clock rather than reading it, so the hours
// this is about can be tested without waiting for them.

// The window, in the competition's own time. Seven calls a day at two credits
// each: 434 in a 31-day month, with 66 to spare.
//
// Two markets cost twice as much per call, so the hourly window that fitted one
// market would be 930 a month and does not fit at all. Halving the frequency is
// what pays for the line.
//
// Every two hours from 8am to 10pm is the version that nearly works: eight
// calls, 496 a month, four credits from the ceiling in a season containing four
// 31-day months. That is the same knife-edge that ruled out an 8-to-11 window
// when there was one market - one manual test and the month is capped - so the
// last call is dropped again, for the same reason.
//
// The lost frequency costs less than it looks. Measured on two finals: seven of
// eleven books quoted a line, five of seven agreed to the half point on one
// game and all seven on the other, and nothing moved across the call. A number
// that stable does not need reading every hour.
const FIRST_HOUR = 8;
const LAST_HOUR = 20;

// One firing in every two, inside the window.
//
// The cron fires hourly and this decides which firings spend anything, so the
// step belongs here beside the window rather than in the cron expression -
// the same argument as the time zone below.
//
// Melbourne's daylight saving switches at 2am and 3am, both outside the
// window, so a transition can never land inside it and cannot shift which
// hours this picks.
const EVERY_HOURS = 2;

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
    everyHours = EVERY_HOURS,
  } = options;

  const hour = hourIn(now, timeZone);
  if (hour < firstHour || hour > lastHour) return false;

  // Counted from the first hour rather than from midnight, so the window always
  // includes its own opening call whatever hour it is set to start at.
  return (hour - firstHour) % everyHours === 0;
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
    // The hour is named because most refusals are now for an hour that is
    // inside the window and simply is not one of its calls. "Outside the
    // window" would be a lie about those, and the log is the only place
    // anybody would ever see it.
    const zone = options.timeZone || TIME_ZONE;
    return {
      poll: false,
      reason: `${hourIn(now, zone)}:00 is not a call in the ${
        options.firstHour ?? FIRST_HOUR
      }:00-${options.lastHour ?? LAST_HOUR}:00 window in ${zone}, every ${
        options.everyHours ?? EVERY_HOURS
      }h`,
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
  const {
    firstHour = FIRST_HOUR,
    lastHour = LAST_HOUR,
    everyHours = EVERY_HOURS,
    // Two, because that is what the call now asks for. A default of one would
    // make this quietly answer a question nobody is asking.
    markets = 2,
    regions = 1,
  } = options;

  const span = lastHour - firstHour;
  const callsPerDay = span < 0 ? 0 : Math.floor(span / everyHours) + 1;
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
  EVERY_HOURS,
  TIME_ZONE,
  RESERVE,
};

const test = require("node:test");
const assert = require("node:assert");

const {
  hourIn,
  inWindow,
  hasQuota,
  shouldPoll,
  monthlyCost,
} = require("./oddsSchedule");

// Every function takes the clock, so the hours this is about are testable
// without waiting for them.
const at = (iso) => new Date(iso);

test("the hour is read in Melbourne, not wherever the server is", () => {
  // 22:00 UTC on 4 June is 08:00 the next morning in Melbourne, which is the
  // first hour of the window - and the middle of the night in UTC.
  assert.equal(hourIn(at("2026-06-04T22:00:00Z")), 8);
  assert.equal(hourIn(at("2026-06-04T12:00:00Z")), 22);
});

// The reason the window is not a UTC cron expression. Melbourne is UTC+10 in
// winter and UTC+11 in summer, and the AFL season crosses both switchovers - so
// one fixed UTC hour is two different local hours across a season.
test("the same UTC instant is a different local hour either side of daylight saving", () => {
  const winter = hourIn(at("2026-06-15T21:30:00Z")); // AEST, UTC+10
  const summer = hourIn(at("2026-12-15T21:30:00Z")); // AEDT, UTC+11

  assert.equal(winter, 7, "07:30 in June - outside the window");
  assert.equal(summer, 8, "08:30 in December - inside it");
  assert.notEqual(winter, summer);
});

test("a UTC-fixed window would drift across the season, and this does not", () => {
  // 21:30 UTC: outside the window in winter, inside it in summer. The window
  // still means 8am to 10pm locally on both dates, which is the point.
  assert.equal(inWindow(at("2026-06-15T21:30:00Z")), false);
  assert.equal(inWindow(at("2026-12-15T21:30:00Z")), true);
});

test("the window is 8am to 10pm inclusive", () => {
  // 2026-06-15 is AEST, so local = UTC + 10.
  assert.equal(inWindow(at("2026-06-14T21:00:00Z")), false, "07:00 - too early");
  assert.equal(inWindow(at("2026-06-14T22:00:00Z")), true, "08:00 - first call");
  assert.equal(inWindow(at("2026-06-15T12:00:00Z")), true, "22:00 - last call");
  assert.equal(inWindow(at("2026-06-15T13:00:00Z")), false, "23:00 - dropped");
  assert.equal(inWindow(at("2026-06-15T15:00:00Z")), false, "01:00 - asleep");
});

// Fifteen calls a day is the whole budget argument.
test("the budget arithmetic that chose 8 to 22", () => {
  assert.equal(monthlyCost(31), 465, "worst-case month fits inside 500");
  assert.equal(monthlyCost(30), 450);

  // 8 to 23 is the version that does not fit: four credits of headroom in a
  // 31-day month, and there are four of those in season.
  assert.equal(monthlyCost(31, { lastHour: 23 }), 496);

  // Credits are markets times regions, so a second market doubles it.
  assert.equal(monthlyCost(31, { markets: 3 }), 1395);
  assert.equal(monthlyCost(31, { markets: 1, regions: 2 }), 930);
});

test("polling stops before the month runs dry", () => {
  assert.equal(hasQuota(500), true);
  assert.equal(hasQuota(21), true);
  assert.equal(hasQuota(20), false, "the reserve is held, not spent");
  assert.equal(hasQuota(0), false);
});

// A missing header is a first run or a changed response shape. Refusing to ever
// call again because a header was absent is a worse failure than one extra
// request.
test("an unknown remaining count does not stop the job", () => {
  assert.equal(hasQuota(null), true);
  assert.equal(hasQuota(undefined), true);
  assert.equal(hasQuota(""), true);
  assert.equal(hasQuota("not a number"), true);
});

test("the header arrives as a string and is still read", () => {
  assert.equal(hasQuota("400"), true);
  assert.equal(hasQuota("3"), false);
});

test("shouldPoll says yes only when both conditions hold", () => {
  const inHours = at("2026-06-15T02:00:00Z"); // midday in Melbourne

  assert.equal(shouldPoll(inHours, { remaining: 400 }).poll, true);
  assert.equal(shouldPoll(inHours, { remaining: 5 }).poll, false);
  assert.equal(shouldPoll(at("2026-06-15T15:00:00Z"), { remaining: 400 }).poll, false);
});

// A run that did nothing should say why, or it looks like a job that failed to
// start.
test("a refusal explains itself", () => {
  const asleep = shouldPoll(at("2026-06-15T15:00:00Z"), { remaining: 400 });
  assert.match(asleep.reason, /window/);

  const broke = shouldPoll(at("2026-06-15T02:00:00Z"), { remaining: 5 });
  assert.match(broke.reason, /5 credits left/);

  const fine = shouldPoll(at("2026-06-15T02:00:00Z"), { remaining: 400 });
  assert.match(fine.reason, /in window/);
});

test("the window and reserve can be overridden for testing", () => {
  const early = at("2026-06-14T20:00:00Z"); // 06:00 in Melbourne
  assert.equal(inWindow(early), false);
  assert.equal(inWindow(early, { firstHour: 5 }), true);
  assert.equal(hasQuota(25, 30), false);
});

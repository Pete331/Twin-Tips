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

test("the window is 8am to 8pm, every second hour", () => {
  // 2026-06-15 is AEST, so local = UTC + 10.
  assert.equal(inWindow(at("2026-06-14T21:00:00Z")), false, "07:00 - too early");
  assert.equal(inWindow(at("2026-06-14T22:00:00Z")), true, "08:00 - first call");
  assert.equal(inWindow(at("2026-06-14T23:00:00Z")), false, "09:00 - between calls");
  assert.equal(inWindow(at("2026-06-15T00:00:00Z")), true, "10:00");
  assert.equal(inWindow(at("2026-06-15T10:00:00Z")), true, "20:00 - last call");
  assert.equal(inWindow(at("2026-06-15T11:00:00Z")), false, "21:00 - dropped");
  assert.equal(inWindow(at("2026-06-15T12:00:00Z")), false, "22:00 - dropped too");
  assert.equal(inWindow(at("2026-06-15T15:00:00Z")), false, "01:00 - asleep");
});

// The step is the whole point: the cron still fires 24 times a day and seven of
// them cost anything.
test("seven of the day's twenty-four firings spend credits", () => {
  const spending = [];

  for (let hour = 0; hour < 24; hour += 1) {
    // Local `hour` on 15 June 2026, which is AEST, so local = UTC + 10.
    const firing = new Date(Date.UTC(2026, 5, 15, (hour - 10 + 24) % 24));
    if (inWindow(firing)) spending.push(hourIn(firing));
  }

  assert.deepEqual(
    spending.sort((a, b) => a - b),
    [8, 10, 12, 14, 16, 18, 20]
  );
});

// Counted from the first hour rather than from midnight, or a window opening at
// an odd hour would skip its own opening call.
test("the step counts from the start of the window", () => {
  const nine = at("2026-06-14T23:00:00Z"); // 09:00 in Melbourne

  assert.equal(inWindow(nine), false, "not a call in an 8am window");
  assert.equal(inWindow(nine, { firstHour: 9 }), true, "the first one in a 9am window");
});

// Seven calls a day at two credits each is the whole budget argument.
test("the budget arithmetic that chose 8 to 20, every second hour", () => {
  assert.equal(monthlyCost(31), 434, "worst-case month fits inside 500");
  assert.equal(monthlyCost(30), 420);

  // Every two hours to 10pm is the version that does not fit: eight calls, 496
  // in a 31-day month, four credits of headroom in a season with four of those
  // months in it.
  assert.equal(monthlyCost(31, { lastHour: 22 }), 496);

  // And the hourly window that fitted one market does not fit two at all -
  // this is the number that forced the step.
  assert.equal(monthlyCost(31, { everyHours: 1, lastHour: 22 }), 930);

  // Credits are markets times regions, so either one doubles it.
  assert.equal(monthlyCost(31, { markets: 4 }), 868);
  assert.equal(monthlyCost(31, { regions: 2 }), 868);

  // One market on the old hourly window, which is where this started.
  assert.equal(
    monthlyCost(31, { everyHours: 1, lastHour: 22, markets: 1 }),
    465
  );
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

test("the window, step and reserve can be overridden for testing", () => {
  const early = at("2026-06-14T20:00:00Z"); // 06:00 in Melbourne

  assert.equal(inWindow(early), false);
  assert.equal(
    inWindow(early, { firstHour: 5 }),
    false,
    "a 5am window calls at 5, 7, 9 - not at 6"
  );
  assert.equal(inWindow(early, { firstHour: 6 }), true);
  assert.equal(inWindow(early, { firstHour: 5, everyHours: 1 }), true);
  assert.equal(hasQuota(25, 30), false);
});

// Most refusals are now for an hour that is inside the window and simply is not
// one of its calls. "Outside the window" would be a lie about those, and this
// string is the only place anybody would ever see what the job decided.
test("a refusal between calls names the hour it refused", () => {
  const nine = shouldPoll(at("2026-06-14T23:00:00Z"), { remaining: 400 });

  assert.equal(nine.poll, false);
  assert.match(nine.reason, /9:00 is not a call/);
  assert.match(nine.reason, /every 2h/);
});

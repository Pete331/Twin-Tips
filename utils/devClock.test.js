const test = require("node:test");
const assert = require("node:assert");

const { parseOffset, now, isActive } = require("./devClock");

// The suite runs without TIME_TRAVEL set, which is the state that matters
// most: the override must be inert unless deliberately switched on.
test("is inactive when TIME_TRAVEL is not set", () => {
  assert.equal(isActive(), false);
  assert.equal(Math.abs(now().getTime() - Date.now()) < 1000, true);
});

test("no offset for an unset value", () => {
  assert.equal(parseOffset(undefined), null);
  assert.equal(parseOffset(""), null);
  assert.equal(parseOffset(null), null);
});

// An offset rather than a fixed instant, so the fake clock still ticks. A
// frozen one could never reach the moment lockout arrives, which is the thing
// most worth watching.
test("returns the distance from now to the target", () => {
  const realNow = Date.parse("2026-08-27T00:00:00Z");
  const oneDay = 24 * 60 * 60 * 1000;

  assert.equal(parseOffset("2026-08-28T00:00:00Z", realNow), oneDay);
  assert.equal(parseOffset("2026-08-26T00:00:00Z", realNow), -oneDay);
});

test("travels backwards as readily as forwards", () => {
  const realNow = Date.parse("2026-08-27T00:00:00Z");
  // Mid-season, months behind the machine's clock - the case this exists for.
  assert.equal(parseOffset("2026-03-15T00:00:00Z", realNow) < 0, true);
});

// A typo would otherwise become NaN, and every date derived from it silently
// nonsense - "Invalid Date" compares false against everything, so lockout
// would simply never trigger.
test("refuses a value it cannot read", () => {
  assert.throws(() => parseOffset("next tuesday"), /not a date this can read/);
  assert.throws(() => parseOffset("2026-13-45"), /not a date this can read/);
});

// Review finding #22. A time with no zone was read in the machine's own zone:
// round 4's published Melbourne bounce, 2026-04-02T19:30, landed at 11:30Z on
// a Perth machine and 08:30Z on a Melbourne one - so typing a fixture's time
// as published put a Perth developer three hours after the real bounce, with
// nothing to say so. The zone has to be written.
test("refuses a time without a zone, and shows it with one", () => {
  assert.throws(() => parseOffset("2026-04-02T19:30"), (err) => {
    assert.match(err.message, /no time zone/);
    assert.match(err.message, /2026-04-02T19:30\+11:00/, "Melbourne, with daylight saving");
    assert.match(err.message, /2026-04-02T19:30\+08:00/, "Perth");
    assert.match(err.message, /2026-04-02T19:30Z/, "UTC");
    return true;
  });
});

// A bare date is no better: JavaScript reads it as UTC midnight, which is
// neither of the zones anybody here means.
test("refuses a bare date for the same reason", () => {
  assert.throws(() => parseOffset("2026-04-02"), /no time zone/);
});

test("takes a time with Z or an offset, as the instant it names", () => {
  const realNow = Date.parse("2026-08-27T00:00:00Z");

  assert.equal(
    parseOffset("2026-04-02T19:30+11:00", realNow),
    Date.parse("2026-04-02T08:30:00Z") - realNow
  );
  assert.equal(
    parseOffset("2026-04-02T19:30:00+1100", realNow),
    Date.parse("2026-04-02T08:30:00Z") - realNow
  );
  assert.equal(
    parseOffset("2026-04-02T08:30Z", realNow),
    Date.parse("2026-04-02T08:30:00Z") - realNow
  );
});

test("names the offending value and suggests a format", () => {
  assert.throws(() => parseOffset("soon"), (err) => {
    assert.match(err.message, /"soon"/);
    assert.match(err.message, /ISO 8601/);
    return true;
  });
});

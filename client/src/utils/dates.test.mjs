import test from "node:test";
import assert from "node:assert";

import { ordinal, timeOfDay, dayAndDate, dateAndTime, dayKey } from "./dates.js";

// Formatting is in the viewer's own timezone, so the tests build dates from
// local parts rather than from an ISO string with a zone on it. Anything else
// would pass or fail depending on where it was run.
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

test("ordinal handles the exceptions, not just the pattern", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  // The ones a hand-rolled n % 10 gets wrong.
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(22), "22nd");
  assert.equal(ordinal(23), "23rd");
  assert.equal(ordinal(31), "31st");
});

test("timeOfDay matches what moment's h:mma gave", () => {
  assert.equal(timeOfDay(local(2026, 9, 4, 19, 30)), "7:30pm");
  assert.equal(timeOfDay(local(2026, 9, 4, 13, 5)), "1:05pm");
  assert.equal(timeOfDay(local(2026, 9, 4, 9, 40)), "9:40am");
});

// Midnight and midday are where a 12-hour clock goes wrong: 0 must read as 12am
// and 12 as 12pm, not 0am and 0pm.
test("midnight and midday", () => {
  assert.equal(timeOfDay(local(2026, 9, 4, 0, 0)), "12:00am");
  assert.equal(timeOfDay(local(2026, 9, 4, 0, 10)), "12:10am");
  assert.equal(timeOfDay(local(2026, 9, 4, 12, 0)), "12:00pm");
  assert.equal(timeOfDay(local(2026, 9, 4, 12, 1)), "12:01pm");
});

test("minutes keep their leading zero", () => {
  assert.equal(timeOfDay(local(2026, 9, 4, 18, 5)), "6:05pm");
  assert.equal(timeOfDay(local(2026, 9, 4, 18, 0)), "6:00pm");
});

test("dayAndDate reads as a heading", () => {
  assert.equal(dayAndDate(local(2026, 9, 3)), "Thursday September 3rd");
  assert.equal(dayAndDate(local(2026, 9, 1)), "Tuesday September 1st");
  assert.equal(dayAndDate(local(2026, 9, 22)), "Tuesday September 22nd");
});

// The month abbreviation comes from Intl in the viewer's own locale, so it is
// "Sept" here and "Sep" on a machine set to en-US. Asserting a literal would
// only be testing which machine ran it, so this checks the shape and takes the
// month from the same place the code does.
test("dateAndTime is day, month, then the time with a space before the meridiem", () => {
  const month = (d) => new Intl.DateTimeFormat(undefined, { month: "short" }).format(d);

  const spring = local(2026, 9, 4, 19, 30);
  assert.equal(dateAndTime(spring), `4 ${month(spring)}, 7:30 pm`);

  const summer = local(2026, 1, 15, 8, 5);
  assert.equal(dateAndTime(summer), `15 ${month(summer)}, 8:05 am`);
});

// The grouping key must be the local date, or a round's fixtures get split
// across two headings and a game is filed under the wrong day.
test("dayKey is the local date, not the UTC one", () => {
  assert.equal(dayKey(local(2026, 9, 3, 23, 40)), "2026-09-03");
  assert.equal(dayKey(local(2026, 9, 3, 0, 30)), "2026-09-03");

  // A time whose local date and UTC date genuinely differ, which depends on
  // which side of UTC this machine sits. East of UTC - Perth is +8 - the small
  // hours are still yesterday in UTC; west of it, late evening is already
  // tomorrow. Picking one fixed time would make this test pass by luck.
  const offset = new Date().getTimezoneOffset();
  if (offset !== 0) {
    const crossing = offset < 0 ? local(2026, 9, 3, 0, 30) : local(2026, 9, 3, 23, 30);
    assert.notEqual(
      dayKey(crossing),
      crossing.toISOString().slice(0, 10),
      "the local and UTC dates should differ here, and dayKey must follow the local one"
    );
  }
});

test("dayKey pads months and days", () => {
  assert.equal(dayKey(local(2026, 1, 5)), "2026-01-05");
  assert.equal(dayKey(local(2026, 12, 31)), "2026-12-31");
});

// Finals fixtures carry no date until the teams are known, and the admin panel
// asks for a timestamp that may never have been written.
test("a missing or unreadable date does not throw", () => {
  assert.equal(timeOfDay(null), "");
  assert.equal(dayAndDate(undefined), "");
  assert.equal(dateAndTime("not a date"), "");
  assert.equal(dayKey(null), "undated");
});

test("a date string is accepted as well as a Date", () => {
  const d = local(2026, 9, 4, 19, 30);
  assert.equal(timeOfDay(d.toISOString()), timeOfDay(d));
  assert.equal(dayKey(d.toISOString()), dayKey(d));
});

// The four date formats this app renders, without a date library.
//
// moment did this in four places and cost 60kB - 19.6kB gzipped - to do it. It
// is also a legacy project: its own documentation says "Moment.js is a legacy
// project in maintenance mode" and does not recommend it for new work. Intl is
// in every browser this app supports and weighs nothing.
//
// Everything here formats in the viewer's own timezone, which is what moment
// did and what a tipping app wants: someone in Perth should see a Melbourne
// night game at the time it starts for them.

// Sunday, Monday, ... and January, February, ... from Intl rather than an array,
// so they are not a second place for English to live.
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const monthLong = new Intl.DateTimeFormat(undefined, { month: "long" });
const monthShort = new Intl.DateTimeFormat(undefined, { month: "short" });

// 1st, 2nd, 3rd, 4th. Intl.PluralRules knows which suffix a number takes, which
// is the part that is easy to get wrong by hand - 11th, 12th and 13th are the
// exceptions, and 21st, 22nd, 23rd are not.
const ordinalRules = new Intl.PluralRules(undefined, { type: "ordinal" });
const SUFFIX = { one: "st", two: "nd", few: "rd", other: "th" };

export const ordinal = (n) => `${n}${SUFFIX[ordinalRules.select(n)] || "th"}`;

// A Date, or null when there is nothing to format.
//
// The null check is not belt and braces: `new Date(null)` is not an invalid
// date, it is the epoch, so a fixture with no date - every finals game before
// its teams are known - rendered as 8:00am on the 1st of January 1970 rather
// than as nothing. Only a real value gets as far as the Date constructor.
const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// 7:30pm. Lower case and no space, as moment's "h:mma" gave.
export const timeOfDay = (value) => {
  const date = toDate(value);
  if (!date) return "";

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${minutes}${hours < 12 ? "am" : "pm"}`;
};

// Thursday September 4th - the heading over each day's fixtures.
export const dayAndDate = (value) => {
  const date = toDate(value);
  if (!date) return "";

  return `${weekday.format(date)} ${monthLong.format(date)} ${ordinal(date.getDate())}`;
};

// 4 Sep, 7:30 pm - the admin panel's "last synced" line. A space before the
// meridiem here, matching what was there before.
export const dateAndTime = (value) => {
  const date = toDate(value);
  if (!date) return "";

  return `${date.getDate()} ${monthShort.format(date)}, ${timeOfDay(date).replace(
    /(am|pm)$/,
    " $1"
  )}`;
};

// 2026-09-04, used to group fixtures into days.
//
// Built from the local parts rather than toISOString, which is UTC. A Thursday
// night game in Melbourne is Thursday in Perth too, but it is already Friday in
// UTC - so the ISO date would split one round's fixtures across two headings,
// and put the game under tomorrow.
export const dayKey = (value) => {
  const date = toDate(value);
  if (!date) return "undated";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

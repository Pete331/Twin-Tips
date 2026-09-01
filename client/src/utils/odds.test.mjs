import test from "node:test";
import assert from "node:assert";

import { formatPrice, priceDetail, freshness } from "./odds.js";

// ES modules, unlike every other test here. The client is ESM and neither
// package declares "type": "module", so Node reads a .js file in it as
// CommonJS and chokes on the first export. The .mjs extension is what lets
// this run under the same `node --test` as the server's suites rather than
// pulling in a second test framework for one file.

// A price is money. Every bookmaker writes 1.4 as $1.40, and "$1.4" reads as a
// rendering fault rather than a price.
test("a price always carries two decimals", () => {
  assert.equal(formatPrice(1.4), "$1.40");
  assert.equal(formatPrice(1.455), "$1.46");
  assert.equal(formatPrice(12), "$12.00");
});

// The card shows nothing at all where there is no price, so the formatter has
// to be able to say "nothing" rather than produce "$NaN". This is the exact
// shape that put the string "NaN" on the finals cards earlier this year.
test("an absent price formats to nothing, not to NaN", () => {
  assert.equal(formatPrice(null), null);
  assert.equal(formatPrice(undefined), null);
  assert.equal(formatPrice(NaN), null);
  assert.equal(formatPrice("1.45"), null, "a string is not a price");
});

test("the detail line names the average and how many books it is over", () => {
  const detail = priceDetail({ average: 1.43, count: 10, low: 1.41, high: 1.46 });
  assert.equal(detail, "Average $1.43 across 10 bookmakers ($1.41 to $1.46)");
});

test("one bookmaker is not bookmakers", () => {
  const detail = priceDetail({ average: 1.44, count: 1, low: 1.44, high: 1.44 });
  assert.equal(detail, "Average $1.44 across 1 bookmaker");
});

// "Range $1.46 to $1.46" is noise. The spread is only worth stating when the
// books disagree.
test("no range is shown when every book agrees", () => {
  const detail = priceDetail({ average: 1.46, count: 3, low: 1.46, high: 1.46 });
  assert.equal(detail, "Average $1.46 across 3 bookmakers");
});

test("a side with no price has no detail line", () => {
  assert.equal(priceDetail(null), null);
  assert.equal(priceDetail({ average: null, count: 0 }), null);
});

// The cron sleeps between 10pm and 8am Melbourne time, so a price read at
// breakfast is legitimately ten hours old. Saying so is what separates a
// number that is out of date from one that is wrong.
test("staleness is stated in the units that suit it", () => {
  const now = new Date("2026-09-03T12:00:00Z");
  const ago = (mins) => new Date(now - mins * 60000);

  assert.equal(freshness(ago(0), now), "just now");
  assert.equal(freshness(ago(25), now), "25 minutes ago");
  assert.equal(freshness(ago(60 * 10), now), "10 hours ago");
  assert.equal(freshness(ago(60 * 24 * 3), now), "3 days ago");
});

test("a missing or unparseable timestamp says nothing", () => {
  assert.equal(freshness(null), null);
  assert.equal(freshness("not a date"), null);
});

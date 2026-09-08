const test = require("node:test");
const assert = require("node:assert");

const { quotaFrom, SPORT, REGIONS, MARKETS } = require("./oddsApi");

// The quota headers are the difference between this client and an ordinary
// one: the remaining count decides whether the next call happens at all, so it
// has to survive the round trip rather than being logged and dropped.
test("the quota headers are read off a response", () => {
  const response = {
    headers: new Map([
      ["x-requests-remaining", "487"],
      ["x-requests-used", "13"],
      ["x-requests-last", "1"],
    ]),
  };
  response.headers.get = Map.prototype.get.bind(response.headers);

  assert.deepEqual(quotaFrom(response), {
    remaining: "487",
    used: "13",
    last: "1",
  });
});

// A response without them is a changed shape or a cached reply, and the
// schedule treats unknown as "carry on" rather than refusing forever.
test("absent headers come back as null, not undefined chaos", () => {
  const bare = { headers: { get: () => null } };
  assert.deepEqual(quotaFrom(bare), {
    remaining: null,
    used: null,
    last: null,
  });
});

// Cost is markets times regions. Two markets in one region is two credits,
// which is the whole budget argument - and the reason the region is not a list
// as well.
test("two markets, one region, two credits", () => {
  assert.equal(MARKETS.split(",").length, 2);
  assert.equal(REGIONS.split(",").length, 1);
  assert.equal(MARKETS, "h2h,spreads");
  assert.equal(REGIONS, "au");
});

// The two files have to agree or the budget is fiction, and nothing else would
// say so: a third market added here without widening the window would cost 651
// a month against a ceiling of 500, and the first sign of it would be the
// credits running out in the third week of September.
test("the market count is the number the budget was built on", () => {
  const { monthlyCost } = require("./oddsSchedule");

  assert.equal(monthlyCost(31, { markets: MARKETS.split(",").length }), 434);
});

test("the sport key is the one phase one assumed, until the probe says otherwise", () => {
  assert.equal(SPORT, "aussierules_afl");
});

test("an unset key is reported rather than sent as undefined", () => {
  const had = process.env.ODDS_API_KEY;
  delete process.env.ODDS_API_KEY;
  delete require.cache[require.resolve("./oddsApi")];
  const fresh = require("./oddsApi");
  assert.equal(fresh.isConfigured(), false);

  if (had === undefined) delete process.env.ODDS_API_KEY;
  else process.env.ODDS_API_KEY = had;
  delete require.cache[require.resolve("./oddsApi")];
});

test("isConfigured is true when a key is present", () => {
  const had = process.env.ODDS_API_KEY;
  process.env.ODDS_API_KEY = "test-key";
  delete require.cache[require.resolve("./oddsApi")];
  const fresh = require("./oddsApi");
  assert.equal(fresh.isConfigured(), true);

  if (had === undefined) delete process.env.ODDS_API_KEY;
  else process.env.ODDS_API_KEY = had;
  delete require.cache[require.resolve("./oddsApi")];
});

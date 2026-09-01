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

// Cost is markets times regions. One of each is one credit, which is the whole
// budget argument - and the reason neither is a list.
test("one market, one region, one credit", () => {
  assert.equal(MARKETS.split(",").length, 1);
  assert.equal(REGIONS.split(",").length, 1);
  assert.equal(MARKETS, "h2h");
  assert.equal(REGIONS, "au");
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

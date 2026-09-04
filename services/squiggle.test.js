const test = require("node:test");
const assert = require("node:assert");

const squiggle = require("./squiggle");

// A fetch that hangs but honours AbortSignal, which is what undici does.
//
// Worth being precise about, because a stub that ignores the signal passes
// whether the timeout is there or not - it hangs either way, and the test
// looks like it is measuring something it is not.
const hangingFetch = () => (url, opts) =>
  new Promise((_resolve, reject) => {
    const signal = opts && opts.signal;
    if (!signal) return;
    signal.addEventListener("abort", () => reject(signal.reason));
  });

const withFetch = async (stub, fn) => {
  const real = global.fetch;
  global.fetch = stub;
  try {
    return await fn();
  } finally {
    global.fetch = real;
  }
};

// The reason this exists: one of these calls is awaited inside
// POST /api/detailsRound, so an upstream that never answers used to hold the
// tips page open for undici's 300 second default.
test("gives up when Squiggle does not respond", async () => {
  await withFetch(hangingFetch(), async () => {
    const started = Date.now();
    await assert.rejects(
      () => squiggle.query("games", { year: 2099 }, { timeoutMs: 150 }),
      /did not respond within 150ms/
    );
    assert.ok(
      Date.now() - started < 2000,
      "should give up on its own rather than wait on the default"
    );
  });
});

test("names the timeout rather than reporting a bare abort", async () => {
  await withFetch(hangingFetch(), async () => {
    await assert.rejects(
      () => squiggle.query("teams", {}, { timeoutMs: 50 }),
      (err) => {
        assert.match(err.message, /Squiggle/);
        assert.doesNotMatch(err.message, /operation was aborted/);
        return true;
      }
    );
  });
});

// A response that arrives inside the budget is unaffected.
test("a prompt response is returned as normal", async () => {
  const ok = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ teams: [{ id: 1, name: "Adelaide" }] }),
  });

  await withFetch(ok, async () => {
    const body = await squiggle.query("teams", { year: 2098 }, { timeoutMs: 5000 });
    assert.equal(body.teams[0].name, "Adelaide");
  });
});

// The failure must not be cached, or one slow moment sticks for the whole TTL.
test("a timeout is not cached", async () => {
  let calls = 0;
  const counting = (url, opts) => {
    calls += 1;
    return hangingFetch()(url, opts);
  };

  await withFetch(counting, async () => {
    await assert.rejects(() => squiggle.query("games", { year: 2097 }, { timeoutMs: 40 }));
    await assert.rejects(() => squiggle.query("games", { year: 2097 }, { timeoutMs: 40 }));
  });

  assert.equal(calls, 2, "the second call should reach the network, not a cached rejection");
});

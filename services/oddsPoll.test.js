const test = require("node:test");
const assert = require("node:assert");

const { pollOdds } = require("./oddsSync");

// 2pm Melbourne on a Thursday in the season - inside the window, so the window
// is never the reason a test below refuses.
const INSIDE = new Date("2026-09-03T04:00:00Z");
// 3am Melbourne. Outside it.
const OUTSIDE = new Date("2026-09-03T17:00:00Z");

// Counts what was called, which is the whole question: the paid call must not
// happen unless the gate said so.
const fake = ({ events = [{ id: "a" }], remaining = "400", configured = true } = {}) => {
  const calls = { events: 0, sync: 0 };

  return {
    calls,
    api: {
      isConfigured: () => configured,
      events: async () => {
        calls.events += 1;
        return { data: events, quota: { remaining, used: "100", last: "0" } };
      },
    },
    sync: async () => {
      calls.sync += 1;
      return { year: 2026, quota: { remaining: "399" }, written: 4, ready: [] };
    },
  };
};

test("in the window with quota and games, it polls", async () => {
  const f = fake();
  const result = await pollOdds({ now: INSIDE, api: f.api, sync: f.sync });

  assert.equal(result.polled, true);
  assert.equal(f.calls.sync, 1);
  assert.equal(result.result.written, 4);
});

test("outside the window it spends nothing", async () => {
  const f = fake();
  const result = await pollOdds({ now: OUTSIDE, api: f.api, sync: f.sync });

  assert.equal(result.polled, false);
  assert.equal(f.calls.sync, 0, "the paid call never happened");
  assert.match(result.reason, /window/);
});

// The reserve exists so a fix can be tested in the last week of a month rather
// than waiting for the 1st. Credits do not carry over, so a month spent early
// is a month with no odds at all.
test("near the floor it stops, and says how near", async () => {
  const f = fake({ remaining: "12" });
  const result = await pollOdds({ now: INSIDE, api: f.api, sync: f.sync });

  assert.equal(result.polled, false);
  assert.equal(f.calls.sync, 0);
  assert.match(result.reason, /12 credits left/);
});

// Five months a year there is no AFL. The free endpoint is what makes those
// months cost nothing rather than fifteen credits a day of empty responses.
test("the off-season costs nothing", async () => {
  const f = fake({ events: [] });
  const result = await pollOdds({ now: INSIDE, api: f.api, sync: f.sync });

  assert.equal(result.polled, false);
  assert.equal(result.upcoming, 0);
  assert.equal(f.calls.sync, 0, "no credit spent on an empty round");
  assert.match(result.reason, /no upcoming games/);
});

// The gate asks its free questions before the paid one, in that order. If the
// paid call ever happened first the gate would be decoration.
test("the free call always precedes the paid one", async () => {
  const order = [];
  const api = {
    isConfigured: () => true,
    events: async () => {
      order.push("events");
      return { data: [{ id: "a" }], quota: { remaining: "400" } };
    },
  };
  const sync = async () => {
    order.push("sync");
    return { quota: {}, written: 0, ready: [] };
  };

  await pollOdds({ now: INSIDE, api, sync });
  assert.deepEqual(order, ["events", "sync"]);
});

test("no key means no calls at all", async () => {
  const f = fake({ configured: false });
  const result = await pollOdds({ now: INSIDE, api: f.api, sync: f.sync });

  assert.equal(result.polled, false);
  assert.equal(f.calls.events, 0);
  assert.equal(f.calls.sync, 0);
  assert.match(result.reason, /ODDS_API_KEY/);
});

// A missing header is a first run or a changed response shape, not a spent
// budget. Refusing to ever call again because a header went absent would be a
// worse failure than one extra request.
test("an absent quota header does not stop the job forever", async () => {
  const f = fake({ remaining: null });
  const result = await pollOdds({ now: INSIDE, api: f.api, sync: f.sync });

  assert.equal(result.polled, true);
  assert.equal(f.calls.sync, 1);
});

const test = require("node:test");
const assert = require("node:assert");

const {
  matchFixture,
  summariseForFixture,
  planEvent,
  plan,
  toDocument,
} = require("./oddsSync");

// Fremantle 6, Hawthorn 10, Carlton 3, Geelong 7 - the ids the database holds.
const fixture = (over = {}) => ({
  id: 40001,
  year: 2026,
  round: 26,
  date: new Date("2026-09-03T10:10:00Z"),
  hteamid: 6,
  ateamid: 10,
  hteam: "Fremantle",
  ateam: "Hawthorn",
  ...over,
});

const event = (over = {}) => ({
  id: "abc123",
  commence_time: "2026-09-03T10:10:00Z",
  home_team: "Fremantle Dockers",
  away_team: "Hawthorn Hawks",
  bookmakers: [
    {
      key: "sportsbet",
      title: "SportsBet",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Fremantle Dockers", price: 1.46 },
            { name: "Hawthorn Hawks", price: 2.75 },
          ],
        },
      ],
    },
    {
      key: "tab",
      title: "TAB",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Fremantle Dockers", price: 1.42 },
            { name: "Hawthorn Hawks", price: 2.9 },
          ],
        },
      ],
    },
  ],
  ...over,
});

const teams = { home: 6, away: 10, unresolved: [], ok: true };

test("an event matches the fixture with the same teams at the same time", () => {
  const matched = matchFixture(event(), [fixture()], teams);
  assert.equal(matched.id, 40001);
});

// The two sources will not agree to the minute, and games move.
test("a few hours of disagreement still matches", () => {
  const moved = fixture({ date: new Date("2026-09-03T04:00:00Z") });
  assert.ok(matchFixture(event(), [moved], teams));
});

test("a different week does not match", () => {
  const nextTime = fixture({ date: new Date("2026-09-20T10:10:00Z") });
  assert.equal(matchFixture(event(), [nextTime], teams), null);
});

// Two clubs meet twice a season, weeks apart. The date is what separates them.
test("the return fixture is not confused with the first", () => {
  const fixtures = [
    fixture({ id: 40001, round: 5, date: new Date("2026-04-10T09:00:00Z") }),
    fixture({ id: 40002, round: 18, date: new Date("2026-09-03T10:10:00Z") }),
  ];

  assert.equal(matchFixture(event(), fixtures, teams).id, 40002);
});

// Refusing beats guessing: two candidates inside three days is a scheduling
// oddity, and pricing the wrong game is worse than pricing neither.
test("two candidates in the window match nothing", () => {
  const fixtures = [
    fixture({ id: 40001 }),
    fixture({ id: 40002, date: new Date("2026-09-04T10:10:00Z") }),
  ];

  assert.equal(matchFixture(event(), fixtures, teams), null);
});

test("a fixture with no date cannot be matched", () => {
  assert.equal(matchFixture(event(), [fixture({ date: null })], teams), null);
});

test("an unresolved team never reaches a match", () => {
  const unresolved = { home: null, away: 10, unresolved: ["?"], ok: false };
  assert.equal(matchFixture(event(), [fixture()], unresolved), null);
});

// The two sources need not agree on which side is nominally at home. Matching
// on the unordered pair means the game is still found.
test("a fixture listing the teams the other way round still matches", () => {
  const swapped = fixture({ hteamid: 10, ateamid: 6 });
  assert.ok(matchFixture(event(), [swapped], teams));
});

// And this is why that is safe: prices follow team ids, so the fixture decides
// the orientation and a disagreement cannot put the favourite's price on the
// underdog.
test("prices follow the team, not the slot they arrived in", () => {
  const straight = summariseForFixture(event(), fixture(), teams);
  assert.equal(straight.home.count, 2);
  assert.equal(straight.home.average, 1.44, "Fremantle, the fixture's home side");
  assert.equal(straight.away.average, 2.83, "Hawthorn");

  const swapped = summariseForFixture(
    event(),
    fixture({ hteamid: 10, ateamid: 6 }),
    teams
  );
  assert.equal(swapped.home.average, 2.83, "Hawthorn is home in this fixture");
  assert.equal(swapped.away.average, 1.44, "so Fremantle's price moves with it");
});

test("a fixture whose teams are not in the event gets nothing, not wrong prices", () => {
  const elsewhere = fixture({ hteamid: 3, ateamid: 7 });
  const sides = summariseForFixture(event(), elsewhere, teams);
  assert.equal(sides.home.count, 0);
  assert.equal(sides.away.count, 0);
});

// Every outcome is named, so a dry run can account for all nine games rather
// than listing the ones that worked.
test("each event gets a status, and unresolved says which name", () => {
  const unknown = event({ home_team: "Tasmania Devils" });
  const result = planEvent(unknown, [fixture()]);

  assert.equal(result.status, "unresolved");
  assert.match(result.detail, /Tasmania Devils/);
});

test("a resolved event with no fixture is unmatched, not silently dropped", () => {
  const result = planEvent(event(), []);
  assert.equal(result.status, "unmatched");
  assert.match(result.detail, /Fremantle Dockers v Hawthorn Hawks/);
});

test("a matched fixture nobody has priced is its own outcome", () => {
  const nothing = event({ bookmakers: [] });
  const result = planEvent(nothing, [fixture()]);

  assert.equal(result.status, "unpriced");
  assert.equal(result.fixture.id, 40001);
});

test("a good event is ready, with both sides summarised", () => {
  const result = planEvent(event(), [fixture()]);
  assert.equal(result.status, "ready");
  assert.equal(result.sides.home.best, 1.46);
  assert.equal(result.sides.home.bookmaker, "SportsBet");
  assert.equal(result.sides.away.best, 2.9);
  assert.equal(result.sides.away.bookmaker, "TAB");
});

test("a plan accounts for every event it was given", () => {
  const events = [
    event(),
    event({ id: "b", home_team: "Tasmania Devils" }),
    event({ id: "c", commence_time: "2026-10-30T10:00:00Z" }),
  ];

  const planned = plan(events, [fixture()]);

  assert.equal(planned.events, 3);
  assert.equal(planned.ready.length, 1);
  assert.equal(planned.unresolved.length, 1);
  assert.equal(planned.unmatched.length, 1);
  assert.equal(
    planned.ready.length +
      planned.unresolved.length +
      planned.unmatched.length +
      planned.unpriced.length,
    3,
    "nothing falls between the categories"
  );
});

// Keyed on Squiggle's game id, which is what the rest of the app calls a
// fixture. The provider's event id is kept for tracing but decides nothing.
test("the document is keyed to the fixture, not the feed", () => {
  const entry = planEvent(event(), [fixture()]);
  const at = new Date("2026-09-01T00:00:00Z");
  const doc = toDocument(entry, at);

  assert.equal(doc.game, 40001);
  assert.equal(doc.year, 2026);
  assert.equal(doc.round, 26);
  assert.equal(doc.homeTeamId, 6);
  assert.equal(doc.awayTeamId, 10);
  assert.equal(doc.eventId, "abc123");
  assert.deepEqual(doc.fetchedAt, at);
  assert.deepEqual(doc.commenceTime, new Date("2026-09-03T10:10:00Z"));
});

// The raw quotes travel with the summary, so revisiting the arithmetic later
// does not need a re-fetch - which is impossible anyway, since the provider
// serves current prices and a past round's are gone.
test("the raw quotes are kept alongside the summary", () => {
  const entry = planEvent(event(), [fixture()]);
  const doc = toDocument(entry, new Date());

  assert.equal(doc.home.quotes.length, 2);
  assert.deepEqual(
    doc.home.quotes.map((q) => q.title).sort(),
    ["SportsBet", "TAB"]
  );
});

// The exchange is excluded from the figures and kept in the record. The
// provider serves current prices only, so a price not written down while it was
// live cannot be fetched back - which would make "exclude Betfair" a decision
// baked into history rather than one that can be revisited.
test("Betfair is out of the arithmetic and in the stored quotes", () => {
  const withExchange = event({
    bookmakers: [
      {
        key: "sportsbet",
        title: "SportsBet",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Fremantle Dockers", price: 1.44 },
              { name: "Hawthorn Hawks", price: 2.8 },
            ],
          },
        ],
      },
      {
        key: "betfair_ex_au",
        title: "Betfair",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Fremantle Dockers", price: 1.55 },
              { name: "Hawthorn Hawks", price: 3.1 },
            ],
          },
        ],
      },
    ],
  });

  const entry = planEvent(withExchange, [fixture()]);
  const doc = toDocument(entry, new Date());

  assert.equal(doc.home.count, 1, "only the bookmaker is counted");
  assert.equal(doc.home.average, 1.44, "the exchange does not move the average");
  assert.equal(doc.home.best, 1.44);
  assert.equal(doc.home.bookmaker, "SportsBet");

  assert.equal(doc.home.quotes.length, 2, "but both are written down");
  assert.ok(
    doc.home.quotes.some((q) => q.title === "Betfair" && q.price === 1.55),
    "including the exchange's price"
  );
});

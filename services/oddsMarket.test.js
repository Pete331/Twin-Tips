const test = require("node:test");
const assert = require("node:assert");

const {
  isExcluded,
  isUsablePrice,
  summariseSide,
  quotesFor,
  summariseEvent,
  linesFor,
  median,
  summariseLine,
} = require("./oddsMarket");

// An event in the shape the v4 feed returns it.
const event = (bookmakers) => ({
  home_team: "Fremantle Dockers",
  away_team: "Hawthorn Hawks",
  bookmakers,
});

const book = (key, title, home, away) => ({
  key,
  title,
  markets: [
    {
      key: "h2h",
      outcomes: [
        ...(home === null ? [] : [{ name: "Fremantle Dockers", price: home }]),
        ...(away === null ? [] : [{ name: "Hawthorn Hawks", price: away }]),
      ],
    },
  ],
});

test("the average is the mean of the prices actually offered", () => {
  const side = summariseSide([
    { bookmaker: "a", title: "A", price: 1.4 },
    { bookmaker: "b", title: "B", price: 1.5 },
    { bookmaker: "c", title: "C", price: 1.45 },
  ]);

  assert.equal(side.average, 1.45);
  assert.equal(side.count, 3);
});

// Rounded on the way out, or every consumer has to remember to do it the same
// way and one of them will not.
test("the average comes back in cents, not to seventeen places", () => {
  const side = summariseSide([
    { bookmaker: "a", title: "A", price: 1.4 },
    { bookmaker: "b", title: "B", price: 1.42 },
    { bookmaker: "c", title: "C", price: 1.48 },
  ]);

  assert.equal(side.average, 1.43);
});

// Decimal odds pay more the higher they are, so best is the longest price.
test("best is the longest price, and names the book offering it", () => {
  const side = summariseSide([
    { bookmaker: "sportsbet", title: "SportsBet", price: 1.4 },
    { bookmaker: "neds", title: "Neds", price: 1.55 },
    { bookmaker: "tab", title: "TAB", price: 1.45 },
  ]);

  assert.equal(side.best, 1.55);
  assert.equal(side.bookmaker, "Neds");
});

test("the spread is kept so an odd average can be explained", () => {
  const side = summariseSide([
    { bookmaker: "a", title: "A", price: 1.4 },
    { bookmaker: "b", title: "B", price: 1.9 },
  ]);

  assert.equal(side.low, 1.4);
  assert.equal(side.high, 1.9);
});

test("no usable prices is empty, not zero", () => {
  const side = summariseSide([]);
  assert.deepEqual(side, {
    average: null,
    best: null,
    bookmaker: null,
    count: 0,
    low: null,
    high: null,
  });
});

// Odds of 1.00 or less pay nothing or less than the stake. Letting them through
// would drag an average toward a number nobody offered.
test("prices at or below evens are refused as bad data", () => {
  assert.equal(isUsablePrice(1.01), true);
  assert.equal(isUsablePrice(1), false);
  assert.equal(isUsablePrice(0), false);
  assert.equal(isUsablePrice(-2), false);
  assert.equal(isUsablePrice(NaN), false);
  assert.equal(isUsablePrice("1.5"), false);

  const side = summariseSide([
    { bookmaker: "a", title: "A", price: 1.5 },
    { bookmaker: "b", title: "B", price: 0 },
  ]);
  assert.equal(side.count, 1);
  assert.equal(side.average, 1.5);
});

// An exchange has no margin to speak of, so it shows the longest price most
// weeks and would take the best-price line every time.
test("Betfair is excluded whatever its key is suffixed with", () => {
  assert.equal(isExcluded("betfair_ex_au"), true);
  assert.equal(isExcluded("betfair"), true);
  assert.equal(isExcluded("BETFAIR_EX_AU"), true);
  assert.equal(isExcluded("sportsbet"), false);
  assert.equal(isExcluded("tab"), false);
  assert.equal(isExcluded(""), false);
});

test("an excluded exchange changes neither figure", () => {
  const withBetfair = summariseEvent(
    event([
      book("sportsbet", "SportsBet", 1.4, 3.0),
      book("tab", "TAB", 1.5, 2.8),
      book("betfair_ex_au", "Betfair", 1.9, 3.4),
    ])
  );

  assert.equal(withBetfair.home.count, 2, "only the two bookmakers count");
  assert.equal(withBetfair.home.average, 1.45);
  assert.equal(withBetfair.home.best, 1.5);
  assert.equal(withBetfair.home.bookmaker, "TAB");
});

// The two sides are summarised independently, which is the point.
test("each side finds its own best, often at a different book", () => {
  const summary = summariseEvent(
    event([
      book("sportsbet", "SportsBet", 1.55, 2.5),
      book("neds", "Neds", 1.4, 3.1),
    ])
  );

  assert.equal(summary.home.bookmaker, "SportsBet");
  assert.equal(summary.away.bookmaker, "Neds");
});

test("a book quoting one side counts for that side only", () => {
  const summary = summariseEvent(
    event([
      book("sportsbet", "SportsBet", 1.4, 3.0),
      book("neds", "Neds", 1.6, null),
    ])
  );

  assert.equal(summary.home.count, 2);
  assert.equal(summary.away.count, 1);
  assert.equal(summary.away.average, 3.0);
});

test("a book listing the away team first is still read correctly", () => {
  const reversed = event([
    {
      key: "tab",
      title: "TAB",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Hawthorn Hawks", price: 2.9 },
            { name: "Fremantle Dockers", price: 1.42 },
          ],
        },
      ],
    },
  ]);

  const summary = summariseEvent(reversed);
  assert.equal(summary.home.average, 1.42);
  assert.equal(summary.away.average, 2.9);
});

// Every level of the feed is optional in practice, and a TypeError inside a
// scheduled job is a failure nobody sees.
test("missing bookmakers, markets and outcomes do not throw", () => {
  assert.equal(summariseEvent(event([])).empty, true);
  assert.equal(summariseEvent({ home_team: "A", away_team: "B" }).empty, true);

  const noH2h = event([{ key: "tab", title: "TAB", markets: [{ key: "totals", outcomes: [] }] }]);
  assert.equal(summariseEvent(noH2h).empty, true);

  const noOutcomes = event([{ key: "tab", title: "TAB", markets: [{ key: "h2h" }] }]);
  assert.equal(summariseEvent(noOutcomes).empty, true);

  const noMarkets = event([{ key: "tab", title: "TAB" }]);
  assert.equal(summariseEvent(noMarkets).empty, true);
});

test("an outcome for a team not in this event is ignored", () => {
  const stray = event([
    {
      key: "tab",
      title: "TAB",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Fremantle Dockers", price: 1.42 },
            { name: "Carlton Blues", price: 2.9 },
          ],
        },
      ],
    },
  ]);

  const { home, away } = quotesFor(stray);
  assert.equal(home.length, 1);
  assert.equal(away.length, 0);
});

// A worked example, so the arithmetic is checked against numbers done by hand
// rather than against itself.
test("a realistic round, checked by hand", () => {
  const summary = summariseEvent(
    event([
      book("sportsbet", "SportsBet", 1.44, 2.75),
      book("tab", "TAB", 1.45, 2.7),
      book("neds", "Neds", 1.42, 2.85),
      book("ladbrokes", "Ladbrokes", 1.47, 2.65),
      book("betfair_ex_au", "Betfair", 1.52, 2.98),
    ])
  );

  // (1.44 + 1.45 + 1.42 + 1.47) / 4 = 1.445 -> 1.45 (Betfair excluded)
  assert.equal(summary.home.average, 1.45);
  assert.equal(summary.home.best, 1.47);
  assert.equal(summary.home.bookmaker, "Ladbrokes");
  assert.equal(summary.home.count, 4);

  // (2.75 + 2.70 + 2.85 + 2.65) / 4 = 2.7375 -> 2.74
  assert.equal(summary.away.average, 2.74);
  assert.equal(summary.away.best, 2.85);
  assert.equal(summary.away.bookmaker, "Neds");
  assert.equal(summary.empty, false);
});

// The bug this arithmetic exists to avoid.
//
// The mean of these four is exactly 1.445. Averaged as floats and rounded at
// the end it comes out 1.44, because 1.445 in binary is a hair under and
// 1.445 * 100 is 144.49999999999997. Working in whole cents makes the sum and
// the division exact, so the only rounding left is a real half.
test("a half-cent average rounds by rule, not by bit pattern", () => {
  const side = summariseSide([
    { bookmaker: "a", title: "A", price: 1.44 },
    { bookmaker: "b", title: "B", price: 1.45 },
    { bookmaker: "c", title: "C", price: 1.42 },
    { bookmaker: "d", title: "D", price: 1.47 },
  ]);

  assert.equal(side.average, 1.45);
  assert.notEqual(
    side.average,
    Math.round(((1.44 + 1.45 + 1.42 + 1.47) / 4) * 100) / 100,
    "the naive float version gives 1.44 - that is the whole point"
  );
});

test("thirds and other awkward divisions still land on cents", () => {
  const thirds = summariseSide([
    { bookmaker: "a", title: "A", price: 1.4 },
    { bookmaker: "b", title: "B", price: 1.4 },
    { bookmaker: "c", title: "C", price: 1.5 },
  ]);
  // 430 / 3 = 143.33 -> 1.43
  assert.equal(thirds.average, 1.43);

  const long = summariseSide([
    { bookmaker: "a", title: "A", price: 8.5 },
    { bookmaker: "b", title: "B", price: 11 },
  ]);
  assert.equal(long.average, 9.75);
});

// A feed is free to send more precision than two places. Each price is taken
// to cents first - money is counted in cents - and the half goes up, the same
// rule at both stages.
test("a price quoted to three places rounds half up, at both stages", () => {
  const side = summariseSide([
    { bookmaker: "a", title: "A", price: 1.435 },
    { bookmaker: "b", title: "B", price: 1.445 },
  ]);
  // 1.435 -> 144c, 1.445 -> 145c, mean 144.5c -> 145c
  assert.equal(side.average, 1.45);
  assert.equal(side.low, 1.44);
  assert.equal(side.high, 1.45);
});

// Every half lands the same way, whichever price it came from. Multiplying by
// 100 gets four of these wrong.
test("halves round up consistently, not by bit pattern", () => {
  const halves = [
    [1.005, 1.01],
    [1.015, 1.02],
    [1.045, 1.05],
    [1.445, 1.45],
    [2.675, 2.68],
    [8.815, 8.82],
  ];

  for (const [price, expected] of halves) {
    const side = summariseSide([{ bookmaker: "a", title: "A", price }]);
    assert.equal(side.average, expected, `${price} should be ${expected}`);
  }
});

// The line. A different market with different arithmetic - what the books
// compete on here is where they set the start, not what they pay at it.

// A book quoting a handicap, mirrored the way every real one does.
const lineBook = (key, title, homePoint, homePrice = 1.9, awayPrice = 1.9) => ({
  key,
  title,
  markets: [
    {
      key: "spreads",
      outcomes: [
        { name: "Fremantle Dockers", price: homePrice, point: homePoint },
        { name: "Hawthorn Hawks", price: awayPrice, point: -homePoint },
      ],
    },
  ],
});

test("the line is the middle of what the books are offering", () => {
  // The odd one out is first on purpose. With the books in order, taking
  // whichever quote happened to arrive first gives the same answer as taking
  // the middle one, and this passes while meaning nothing.
  const { home } = linesFor(
    event([
      lineBook("a", "A", -20.5),
      lineBook("b", "B", -21.5),
      lineBook("c", "C", -21.5),
    ])
  );

  const summary = summariseLine(home);

  assert.equal(summary.point, -21.5);
  assert.equal(summary.count, 3);
  assert.equal(summary.low, -21.5);
  assert.equal(summary.high, -20.5);
});

// The real case that chose the median over the mean, from the probe: five books
// at -21.5 and two at -20.5 average -21.214, which is not a line anybody in the
// country is offering.
test("the middle, not the mean", () => {
  const points = [-21.5, -21.5, -21.5, -21.5, -21.5, -20.5, -20.5];
  const mean = points.reduce((sum, p) => sum + p, 0) / points.length;

  assert.equal(median(points), -21.5);
  assert.ok(Math.abs(mean + 21.214) < 0.001, "the mean is not a line on offer");
});

// Accepted, and the reason it is accepted is that this is a margin estimate
// rather than a price anybody is being offered at.
test("an even split lands between the two lines", () => {
  assert.equal(median([-21.5, -20.5]), -21);
});

// The away side carries its own mirrored quote, so a caller reading the side
// that belongs to the fixture's home team gets the sign right without anything
// having to negate it.
test("both sides come back, mirrored", () => {
  const { home, away } = linesFor(event([lineBook("a", "A", -21.5)]));

  assert.equal(home[0].point, -21.5);
  assert.equal(away[0].point, 21.5);
  assert.equal(summariseLine(away).point, 21.5);
});

// low and high are the smaller and larger of the points as stated, so they swap
// over with the sign - they do not mean "best" and "worst".
test("the range follows the side it belongs to", () => {
  const books = [lineBook("a", "A", -21.5), lineBook("b", "B", -20.5)];
  const { home, away } = linesFor(event(books));

  const homeSide = summariseLine(home);
  const awaySide = summariseLine(away);

  assert.deepEqual([homeSide.low, homeSide.high], [-21.5, -20.5]);
  assert.deepEqual([awaySide.low, awaySide.high], [20.5, 21.5]);
});

// Seven of eleven books quoted a line on the games probed. A book pricing the
// winner and not the handicap must not count toward the line, or the count
// claims an agreement between books that never happened.
test("a book that prices the winner but not the line is not counted", () => {
  const mixed = event([
    book("sportsbet", "SportsBet", 1.46, 2.75),
    lineBook("tab", "TAB", -21.5),
  ]);

  // SportsBet priced the winner only, TAB the handicap only.
  assert.equal(quotesFor(mixed).home.length, 1);
  assert.equal(quotesFor(mixed).home[0].bookmaker, "sportsbet");

  assert.equal(linesFor(mixed).home.length, 1);
  assert.equal(linesFor(mixed).home[0].bookmaker, "tab");
});

// A line taken on trust is a line that could be pointing the wrong way.
test("a book quoting one side of the handicap is left out", () => {
  const half = event([
    {
      key: "a",
      title: "A",
      markets: [
        {
          key: "spreads",
          outcomes: [{ name: "Fremantle Dockers", price: 1.9, point: -21.5 }],
        },
      ],
    },
  ]);

  assert.deepEqual(linesFor(half), { home: [], away: [] });
});

test("a book whose sides do not mirror is left out rather than half-read", () => {
  const odd = event([
    {
      key: "a",
      title: "A",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Fremantle Dockers", price: 1.9, point: -21.5 },
            { name: "Hawthorn Hawks", price: 1.9, point: 19.5 },
          ],
        },
      ],
    },
  ]);

  assert.deepEqual(linesFor(odd), { home: [], away: [] });
});

test("a point that is not a number is dropped, not stored as NaN", () => {
  const bad = event([
    {
      key: "a",
      title: "A",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Fremantle Dockers", price: 1.9, point: "nineteen" },
            { name: "Hawthorn Hawks", price: 1.9, point: 19.5 },
          ],
        },
      ],
    },
  ]);

  assert.deepEqual(linesFor(bad), { home: [], away: [] });
});

test("no line at all is empty, not zero", () => {
  const summary = summariseLine([]);

  assert.equal(summary.point, null);
  assert.equal(summary.count, 0);
  assert.equal(summary.low, null);
  assert.equal(summary.high, null);
});

// The exchange does not quote this market at all, so the exclusion is a no-op
// today. It is applied and tested because the reason for it would come straight
// back the day Betfair listed a line.
test("the exchange is excluded from the line too, if it ever sets one", () => {
  const withExchange = event([
    lineBook("a", "A", -21.5),
    lineBook("betfair_ex_au", "Betfair", -25.5),
  ]);

  assert.equal(linesFor(withExchange).home.length, 1);
  assert.equal(linesFor(withExchange, { includeExcluded: true }).home.length, 2);
});

// The price says nothing on this market - every book paid $1.90 - but it is
// stored so a book that starts differentiating leaves a trace of when it began.
test("the price is kept even though it says nothing today", () => {
  const { home } = linesFor(event([lineBook("a", "A", -21.5, 1.87, 1.95)]));

  assert.equal(home[0].price, 1.87);
});

// Zero is the books calling it even, which is a real line and not a missing one
// - and it is falsy, which is how it would get lost.
test("a line of zero is a real line", () => {
  const summary = summariseLine(linesFor(event([lineBook("a", "A", 0)])).home);

  assert.equal(summary.point, 0);
  assert.equal(summary.count, 1);
});

test("missing bookmakers, markets and outcomes do not throw", () => {
  assert.deepEqual(linesFor({ home_team: "A", away_team: "B" }), {
    home: [],
    away: [],
  });
  assert.deepEqual(linesFor(event([{ key: "a", title: "A" }])), {
    home: [],
    away: [],
  });
  assert.deepEqual(
    linesFor(event([{ key: "a", title: "A", markets: [{ key: "spreads" }] }])),
    { home: [], away: [] }
  );
});

// Turning a list of bookmaker prices into the two numbers a fixture card
// shows: the average price across the bookmakers, and the best one available.
//
// Both are prices in dollars, exactly as offered. There is a standard technique
// for converting odds into a probability - invert each price, normalise a
// book's two sides to 100% to strip its margin, average across books - and it
// is the right method for estimating a chance and the wrong one here. Removing
// the margin produces a price no bookmaker will honour, and an average of
// $1.52 beside a best available of $1.45 reads as a bug to anyone who checks.
//
// Pure. No database, no network, no clock.

// Betfair is an exchange, not a bookmaker: its prices come from people betting
// against each other and it takes commission on winnings rather than building a
// margin into the price. It therefore shows the longest price on the board most
// weeks, and would both win the best-price line every time and drag the average
// with it.
//
// Matched by prefix because the feed's key carries a region suffix that is not
// worth pinning down - betfair_ex_au today, something adjacent tomorrow.
const EXCLUDED_PREFIXES = ["betfair"];

const isExcluded = (bookmakerKey) => {
  const key = String(bookmakerKey || "").toLowerCase();
  return EXCLUDED_PREFIXES.some((prefix) => key.startsWith(prefix));
};

// A price has to be a finite number above 1. Decimal odds of 1.00 or less pay
// nothing or less than the stake, so anything at or below it is bad data rather
// than a short price, and letting it through would drag an average toward a
// number no book ever offered.
const isUsablePrice = (value) => Number.isFinite(value) && value > 1;

// Prices are money, so the arithmetic is done in whole cents.
//
// Averaging in floating point and rounding at the end is wrong often enough to
// matter: the mean of 1.44, 1.45, 1.42 and 1.47 is exactly 1.445, but 1.445 in
// binary is a hair under, so multiplying by 100 gives 144.49999999999997 and
// the round goes down to 1.44. Every half-cent average is a coin toss decided
// by the bit pattern rather than by a rule.
//
// Converting each price to an integer first makes the sum and the division
// exact, and the one rounding left is a documented half-up on a value that is
// genuinely a half.
// Via a string rather than a multiplication. `1.445 * 100` is
// 144.49999999999997 and rounds down; `Number("1.445e+2")` parses the decimal
// literal 144.5, which is exactly representable, and rounds up. Same rule for
// every price instead of one decided by the bit pattern.
const asCents = (price) => Math.round(Number(`${price}e+2`));

const centsToPrice = (cents) =>
  cents === null ? null : Math.round(cents) / 100;

// One side of one market, summarised.
//
// Takes the quotes that survived filtering: [{ bookmaker, title, price }].
const summariseSide = (quotes) => {
  const usable = quotes.filter((q) => isUsablePrice(q.price));

  if (!usable.length) {
    return { average: null, best: null, bookmaker: null, count: 0, low: null, high: null };
  }

  const cents = usable.map((q) => asCents(q.price));
  const total = cents.reduce((sum, value) => sum + value, 0);

  // The longest price wins: decimal odds pay more the higher they are, so
  // "best" for someone backing this side is the maximum, not the minimum.
  const best = usable.reduce((a, b) => (b.price > a.price ? b : a));

  return {
    average: centsToPrice(total / usable.length),
    best: centsToPrice(asCents(best.price)),
    // Stored with the price because a price with no source cannot be acted on.
    bookmaker: best.title || best.bookmaker,
    // How many books the average is over. An average across three is a
    // different claim from an average across eleven, and early in the week it
    // is often three.
    count: usable.length,
    // The spread, so an average pulled about by one stale book can be explained
    // rather than guessed at.
    low: centsToPrice(Math.min(...cents)),
    high: centsToPrice(Math.max(...cents)),
  };
};

// Pulls the head-to-head quotes for one event out of the feed's shape.
//
// The v4 response nests bookmakers, then markets, then outcomes, and every
// level is optional in practice: a book can appear with no h2h market, and a
// market can carry one outcome when a book has pulled a price. Each level is
// checked rather than assumed, because the failure is a thrown TypeError inside
// a scheduled job that nobody is watching.
// includeExcluded is for storage rather than arithmetic. The figures on the
// card are bookmaker figures, so the exchange is filtered out before they are
// worked out - but what gets written down should be everything that priced the
// game. The provider serves current prices only, so a price not stored while it
// was live cannot be fetched back, and a decision to include or exclude a book
// is then unrevisable rather than merely wrong.
const quotesFor = (event, marketKey = "h2h", { includeExcluded = false } = {}) => {
  const home = [];
  const away = [];

  for (const bookmaker of event.bookmakers || []) {
    if (!includeExcluded && isExcluded(bookmaker.key)) continue;

    const market = (bookmaker.markets || []).find((m) => m.key === marketKey);
    if (!market) continue;

    for (const outcome of market.outcomes || []) {
      const quote = {
        bookmaker: bookmaker.key,
        title: bookmaker.title,
        price: Number(outcome.price),
      };

      // Matched on the name the event itself gives, so a book listing the
      // teams in the other order is still read correctly.
      if (outcome.name === event.home_team) home.push(quote);
      else if (outcome.name === event.away_team) away.push(quote);
    }
  }

  return { home, away };
};

// Both sides of one event.
//
// The two sides are summarised independently, which is the point: each team's
// best price is found on its own, so the winning bookmaker is often different
// for each. Nobody shops for the best pair, they shop for the side they mean to
// back.
//
// A book that quoted only one side counts toward that side and not the other,
// which falls out of summarising separately rather than needing a rule.
const summariseEvent = (event, marketKey = "h2h") => {
  const { home, away } = quotesFor(event, marketKey);

  return {
    home: summariseSide(home),
    away: summariseSide(away),
    // True when neither side has a single usable price - a game the books have
    // not opened yet, or one they have taken down. A caller should store
    // nothing rather than store an empty row.
    empty: !home.length && !away.length,
  };
};

// The line, which is a different kind of number from a price.
//
// A handicap quotes two things per side - the start, and what it pays at that
// start - and only the first carries information. Measured across two finals
// and fourteen quotes: every book paid $1.90 either way bar one at $1.89, and
// they competed entirely on where they set the line. So there is no best price
// to find, nobody to name as offering it, and nothing to shop for. What follows
// is about points and ignores the money, which is why it is not summariseSide
// with a different market key.
//
// Betfair does not quote the market at all - of eleven books, the four that
// skipped it were Ladbrokes, Neds, Unibet and the exchange - so the exclusion
// above is a no-op here. It is applied anyway rather than dropped: the reason
// it exists would come straight back if the exchange ever listed a line.
const LINE_MARKET = "spreads";

// The two sides of the handicap, per book, in the shape quotesFor returns.
//
// Deliberately the same shape, because it lets a caller orient a line exactly
// the way it already orients a price: attach each side to a team id, then read
// the one belonging to the fixture's home team. The away side carries its own
// mirrored point, so the sign comes out right without anything having to negate
// it - and a sign flipped by hand in one of two places is precisely the bug
// nobody would ever spot.
const linesFor = (event, { includeExcluded = false } = {}) => {
  const home = [];
  const away = [];

  for (const bookmaker of event.bookmakers || []) {
    if (!includeExcluded && isExcluded(bookmaker.key)) continue;

    const market = (bookmaker.markets || []).find((m) => m.key === LINE_MARKET);
    if (!market) continue;

    const sides = { home: null, away: null };

    for (const outcome of market.outcomes || []) {
      const quote = {
        bookmaker: bookmaker.key,
        title: bookmaker.title,
        point: Number(outcome.point),
        // Kept although it says nothing today. The provider serves current
        // prices only, so a book that started pricing its lines differently
        // would leave no trace of when it began unless this was already here.
        price: Number(outcome.price),
      };

      if (outcome.name === event.home_team) sides.home = quote;
      else if (outcome.name === event.away_team) sides.away = quote;
    }

    // Both sides or neither. A book with one side quoted has no mirror to check
    // against, and a line taken on trust is a line that could be pointing the
    // wrong way.
    if (!sides.home || !sides.away) continue;

    if (
      !Number.isFinite(sides.home.point) ||
      !Number.isFinite(sides.away.point)
    ) {
      continue;
    }

    // Symmetric on all fourteen quotes seen. A book that is not is not a book
    // this understands, so it is left out rather than half-read.
    if (sides.home.point !== -sides.away.point) continue;

    home.push(sides.home);
    away.push(sides.away);
  }

  return { home, away };
};

// The middle value - which, for an odd count, is a line somebody is actually
// offering.
//
// The mean is not, and the difference is real rather than theoretical: five
// books at -21.5 and two at -20.5 average -21.214, a number no board in the
// country shows. An even split can still put the median half way between two
// quoted lines, and that is accepted here - this is a margin estimate, not a
// price anybody is being offered, so a value between two lines is a summary
// rather than the fiction an invented price would be.
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

// One side's line, summarised.
//
// No mean is stored. Every quote is written down, so anyone who later prefers
// one can work it out from the row - the same argument that keeps the raw
// prices rather than only the average of them.
const summariseLine = (quotes) => {
  const usable = quotes.filter((q) => Number.isFinite(q.point));

  if (!usable.length) {
    return { point: null, count: 0, low: null, high: null };
  }

  const points = usable.map((q) => q.point);

  return {
    // Signed, and oriented by whoever calls this: negative means the side these
    // quotes belong to is giving a start, which is to say it is favoured.
    point: median(points),
    // A line agreed across seven books is a different claim from one book's
    // opinion, and early in the week it is often one book's opinion.
    count: usable.length,
    // Where the books disagree. Half a point most weeks, occasionally more,
    // which is the only signal available that a game is hard to price.
    low: Math.min(...points),
    high: Math.max(...points),
  };
};

module.exports = {
  isExcluded,
  isUsablePrice,
  summariseSide,
  quotesFor,
  summariseEvent,
  linesFor,
  median,
  summariseLine,
  EXCLUDED_PREFIXES,
  LINE_MARKET,
};

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// One row per fixture: what the bookmakers make of it, as at the last poll.
//
// Not one row per bookmaker. The card reads a fixture and wants both sides at
// once, so a document per fixture is one lookup instead of a dozen, and the
// unique key is the fixture itself - re-polling replaces rather than
// accumulates, which is the guarantee that mattered.
//
// The raw quotes are kept alongside the summary. They cost almost nothing -
// eleven books across nine games is a couple of hundred numbers a round - and
// they mean a decision about the arithmetic can be revisited on data already
// held. Excluding Betfair, or preferring a median, becomes a recomputation
// rather than a re-fetch, and a re-fetch of a past round is impossible: the
// provider serves current prices, so a price not stored when it was live is
// gone.
const quoteSchema = new Schema(
  {
    bookmaker: { type: String },
    title: { type: String },
    price: { type: Number },
  },
  { _id: false }
);

// The summary a card renders, per side.
const sideSchema = new Schema(
  {
    // The mean across the bookmakers that priced this side, in dollars.
    average: { type: Number, default: null },
    // The longest price, which is the best for someone backing this side.
    best: { type: Number, default: null },
    // Who is offering it. A price with no source cannot be acted on.
    bookmaker: { type: String, default: null },
    // How many books the average is over. An average across three is a
    // different claim from an average across eleven.
    count: { type: Number, default: 0 },
    low: { type: Number, default: null },
    high: { type: Number, default: null },
    quotes: { type: [quoteSchema], default: [] },
  },
  { _id: false }
);

// One book's line, and what it pays at it.
//
// A different shape from a price quote because a handicap is two numbers and
// only one of them says anything - see services/oddsMarket.js.
const lineQuoteSchema = new Schema(
  {
    bookmaker: { type: String },
    title: { type: String },
    // Signed, on the home team of the fixture this row belongs to.
    point: { type: Number },
    price: { type: Number },
  },
  { _id: false }
);

// The handicap, summarised.
const lineSchema = new Schema(
  {
    // The middle of what the books are offering, on the home side. Negative
    // means the home team is the one giving a start.
    point: { type: Number, default: null },
    // How many books set one - fewer than price a winner. Of eleven quoting a
    // head to head, seven quoted a line.
    count: { type: Number, default: 0 },
    low: { type: Number, default: null },
    high: { type: Number, default: null },
    quotes: { type: [lineQuoteSchema], default: [] },
  },
  { _id: false }
);

const oddsSchema = new Schema(
  {
    // Squiggle's game id, which is what every other collection keys a fixture
    // by. The odds provider has its own event id, kept below for tracing, but
    // it is theirs and could change.
    game: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    round: {
      type: Number,
      required: true,
    },

    // Oriented to the fixture, not to the feed.
    //
    // The two sources need not agree on which side is nominally at home, and a
    // swap would put a favourite's price against the underdog. The sync
    // attaches each price to a team id and then fills these from the fixture's
    // own hteamid and ateamid, so the orientation can only ever come from one
    // place.
    homeTeamId: { type: Number },
    awayTeamId: { type: Number },
    home: { type: sideSchema, default: () => ({}) },
    away: { type: sideSchema, default: () => ({}) },

    // One signed number for the game, rather than one per side, because the
    // two sides of a handicap are the same fact stated twice.
    //
    // Oriented to the fixture's home team like the prices above it, and by the
    // same mechanism - but the orientation matters more here. A price attached
    // to the wrong side is wrong; a line attached to the wrong side is exactly
    // as wrong, and reads as perfectly plausible.
    line: { type: lineSchema, default: () => ({}) },

    // When the prices were read. Displayed, not just stored: a price with no
    // age is a claim the app cannot support, and these go stale in minutes near
    // a bounce.
    fetchedAt: {
      type: Date,
      default: Date.now,
    },

    // The provider's own event id and start time, for tracing a row back to the
    // response it came from when a match looks wrong.
    eventId: { type: String },
    commenceTime: { type: Date },
  },
  { timestamps: true }
);

// One row per fixture per season. Upserted on this, so re-polling a round
// corrects rather than duplicates.
oddsSchema.index({ year: 1, game: 1 }, { unique: true });

const Odds = mongoose.model("Odds", oddsSchema);

module.exports = Odds;

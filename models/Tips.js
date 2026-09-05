const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tipSchema = new Schema({
  // An ObjectId, not a string holding one. Every league query joins
  // memberships to tips, and a string would need casting on each of them.
  // Migrated by scripts/migrateToLeagues.js, which also rebuilds the index
  // below - its partial filter tested for a string type, so after the
  // conversion it would have matched nothing and quietly stopped enforcing
  // anything.
  //
  // Required, along with round and season below. Nothing here was, so the
  // schema described the shape of a tip without insisting on it and validation
  // lived only in POST /api/tips - one of several ways a tip gets written.
  //
  // A tip missing any of the three is not merely incomplete. It escapes the
  // unique index below, whose partial filter tests for exactly these types, so
  // the one constraint stopping a double submission does not cover it; and it
  // is invisible to every season-scoped read. The collection already carries
  // documents of that shape from 2022, left by the old browser-driven writes.
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  round: {
    type: Number,
    required: true,
  },
  season: {
    type: Number,
    required: true,
  },
  topEightSelection: {
    type: String,
  },
  bottomTenSelection: {
    type: String,
  },
  marginTopEight: {
    type: Number,
  },
  marginBottomTen: {
    type: Number,
  },
  // What each selection scored: 1 for a win, 0.5 for a draw, 0 for a loss,
  // null where the game has not been played. Boolean until draws started
  // counting half, which a boolean cannot express. Mongoose casts what is
  // already stored - true to 1, false to 0 - so rounds scored before this
  // still read correctly.
  topEightCorrect: {
    type: Number,
  },
  bottomTenCorrect: {
    type: Number,
  },
  topEightDifference: {
    type: Number,
  },
  bottomTenDifference: {
    type: Number,
  },
  correctTips: {
    type: Number,
  },
  winnings: {
    type: Number,
    default: 0,
  },
});

// One tip per user, per round, per season. POST /api/tips upserts on exactly
// these three fields, and an upsert without a unique index behind it is not
// atomic: two submissions landing together can both miss the existing document
// and both insert. A double-tap before lockout is precisely that shape of
// request, and the duplicate is invisible afterwards - scoring updates one of
// the pair, while the leaderboard counts entries by document.
//
// Partial, because the collection carries documents from 2022 that have no
// user and no season at all - empty shells left by the old browser-driven
// writes. A plain unique index reads those missing fields as null, finds ten
// of them identical, and fails to build; Mongoose reports that on the model
// rather than by refusing to start, so it would look like it had worked.
// Restricting the constraint to documents that actually have the fields
// enforces it where it means something and ignores the junk.
tipSchema.index(
  { user: 1, round: 1, season: 1 },
  {
    unique: true,
    partialFilterExpression: {
      user: { $type: "objectId" },
      round: { $type: "number" },
      season: { $type: "number" },
    },
  }
);

// The read path. Almost nothing asks for one person's tip; the queries that
// run on every page ask for a whole round, or a whole season:
//
//   POST /api/roundResult        find({ round, season })
//   POST /api/leaderboard        find({ season })
//   results.calculateRound       find({ round, season })
//   league standings             find({ season, round: { $in: [...] } })
//
// None of those can use the unique index above, whose first key is the user.
// Measured with explain() before this was added, all four were collection
// scans - 135 documents examined to return 6. That is nothing today and grows
// with every tip ever submitted: a hundred players over five seasons is twelve
// thousand documents read on each of those queries.
//
// season first, because it is the key every one of them constrains and the
// only one some of them constrain at all.
tipSchema.index({ season: 1, round: 1 });

// `required` above does not reach the path that actually writes tips.
//
// Every tip is created by an upsert: POST /api/tips builds a query from the
// session, the round and the season, and findOneAndUpdate inserts if nothing
// matches. Mongoose's update validators do not apply required to an upsert -
// measured, not assumed: an upsert with no season anywhere is accepted and
// stores a document with season undefined, with runValidators on or off. So
// required covers create() and save(), and nothing that runs today.
//
// This covers the rest. Only on an upsert, because a plain update is scoring
// writing back to a document that already exists - its query names one
// document rather than describing a new one, and holding it to the full shape
// would break every score write.
// async and throwing, not a next callback: Mongoose 9 query middleware is
// promise-based and passes no next, so a hook written the old way fails with
// "next is not a function" on every update it touches.
tipSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], async function () {
  if (!this.getOptions().upsert) return;

  const query = this.getQuery() || {};
  const update = this.getUpdate() || {};
  // An upsert builds the new document from both, so a field named in either
  // ends up on the result and either is enough.
  const set = update.$set || update;

  const missing = ["user", "round", "season"].filter((field) => {
    const value = set[field] === undefined ? query[field] : set[field];
    return value === undefined || value === null;
  });

  if (missing.length) {
    throw new Error(
      `a tip needs ${missing.join(", ")}; refusing to insert one without`
    );
  }
});

tipSchema.virtual("userDetail", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
});

// To include virtuals in res.json(), you need to set the toJSON schema option to { virtuals: true }.
tipSchema.set("toObject", { virtuals: true });
tipSchema.set("toJSON", { virtuals: true });

const Tip = mongoose.model("Tip", tipSchema);

module.exports = Tip;

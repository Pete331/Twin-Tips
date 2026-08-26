const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tipSchema = new Schema({
  user: {
    type: String,
  },
  round: {
    type: Number,
  },
  season: {
    type: Number,
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
  topEightCorrect: {
    type: Boolean,
  },
  bottomTenCorrect: {
    type: Boolean,
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
      user: { $type: "string" },
      round: { $type: "number" },
      season: { $type: "number" },
    },
  }
);

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

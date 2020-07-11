const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const fixtureSchema = new Schema({
  year: {
    type: Number,
  },
  date: {
    type: String,
  },
  round: {
    type: Number,
  },
  venue: {
    type: String,
  },
  tz: {
    type: String,
  },
  complete: {
    type: Number,
  },
  hteam: {
    type: String,
  },
  hteamid: {
    type: Number,
  },
  hgoals: {
    type: Number,
  },
  hbehinds: {
    type: Number,
  },
  hscore: {
    type: Number,
  },
  ateam: {
    type: String,
  },
  ateamid: {
    type: Number,
  },
  agoals: {
    type: Number,
  },
  abehinds: {
    type: Number,
  },
  ascore: {
    type: Number,
  },
  is_final: {
    type: Boolean,
  },
  is_grand_final: {
    type: Boolean,
  },
  winner: {
    type: String,
  },
  winnerteamid: {
    type: Number,
  },
});

fixtureSchema.virtual("home-team", {
  ref: "Team", // The model to use
  localField: "hteamid", // Find hteamid where `localField`
  foreignField: "id", // is equal to `foreignField`
  // If `justOne` is true, 'members' will be a single doc as opposed to
  // an array. `justOne` is false by default.
  // justOne: false,
  // options: { sort: { name: -1 }, limit: 5 } // Query options, see http://bit.ly/mongoose-query-options
});

fixtureSchema.virtual("away-team", {
  ref: "Team",
  localField: "ateamid",
  foreignField: "id",
});

fixtureSchema.virtual("home-team-standing", {
  ref: "Standing",
  localField: "hteamid",
  foreignField: "id",
  // match: { played: this.round },
});

fixtureSchema.virtual("away-team-standing", {
  ref: "Standing",
  localField: "ateamid",
  foreignField: "id",
});

// To include virtuals in res.json(), you need to set the toJSON schema option to { virtuals: true }.
fixtureSchema.set("toObject", { virtuals: true });
fixtureSchema.set("toJSON", { virtuals: true });

const Fixture = mongoose.model("Fixture", fixtureSchema);

module.exports = Fixture;

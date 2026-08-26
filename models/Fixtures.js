const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const fixtureSchema = new Schema({
  year: {
    type: Number,
  },
  date: {
    type: Date,
  },
  round: {
    type: Number,
  },
  // Squiggle's label for the round, e.g. "Round 12", "Wildcard Finals",
  // "Preliminary Finals". This is the only dependable way to tell a finals
  // round from a home-and-away one: is_final comes back 0 for every 2026 game,
  // including the Grand Final.
  roundname: {
    type: String,
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
  // Not a flag: Squiggle sends a code for the finals type - 0 home-and-away,
  // 7 wildcard, 2/3 week one, 4 semi, 5 preliminary, 6 grand final. Declaring
  // it Boolean made Mongoose reject the real values with a CastError. Any
  // non-zero value means finals.
  is_final: {
    type: Number,
  },
  is_grand_final: {
    type: Number,
  },
  winner: {
    type: String,
  },
  winnerteamid: {
    type: Number,
  },
  id: {
    type: Number,
  },
},
{
  // So the admin panel can report when the fixtures last came down from
  // Squiggle. Existing documents have no value until the next sync rewrites
  // them - this is not backfilled.
  timestamps: true,
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

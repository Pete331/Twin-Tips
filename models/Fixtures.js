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

// The home-team-standing and away-team-standing virtuals are gone. They
// matched on team id alone, with no year and no round, which was right when
// there was a single global ladder. Now that a snapshot is kept per team, per
// round, per season, populating them returned every snapshot ever stored for a
// club - about fifty rows where the caller wanted one.
//
// The keys themselves live on: POST /api/detailsRound attaches the ladder that
// applied when the round opened, as a single-element array under the same
// names, which is what TipsPage reads.

// Squiggle's game id, which every sync upserts on. Unique because that is what
// makes the upsert atomic: without it two overlapping syncs can both miss an
// existing fixture and both insert. It was also unindexed entirely, so each of
// the 218 upserts in a sync scanned the whole collection.
fixtureSchema.index({ id: 1 }, { unique: true });

// The read path: nearly every query asks for one round of one season.
fixtureSchema.index({ year: 1, round: 1 });

// To include virtuals in res.json(), you need to set the toJSON schema option to { virtuals: true }.
fixtureSchema.set("toObject", { virtuals: true });
fixtureSchema.set("toJSON", { virtuals: true });

const Fixture = mongoose.model("Fixture", fixtureSchema);

module.exports = Fixture;

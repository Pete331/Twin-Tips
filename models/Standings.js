const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// One row per team, per round, per season - a snapshot of the ladder as it
// stood after that round.
//
// This used to be a single global ladder of 18 rows with no season or round,
// overwritten in place. That meant looking back at an earlier round coloured
// the teams by today's ladder, a team could move between the top 8 and the
// bottom 10 after people had already tipped, and loading another season
// destroyed the current one. Twin Tips is played against the ladder as it
// stood when the round opened, so that ladder has to be kept.
const standingSchema = new Schema(
  {
    year: {
      type: Number,
    },
    // The ladder as it stands AFTER this round. Tipping round N is judged
    // against the snapshot for round N-1.
    round: {
      type: Number,
    },
    // Squiggle's team id.
    id: {
      type: Number,
    },
    name: {
      type: String,
    },
    rank: {
      type: Number,
    },
    played: {
      type: Number,
    },
    wins: {
      type: Number,
    },
    losses: {
      type: Number,
    },
    draws: {
      type: Number,
    },
    pts: {
      type: Number,
    },
    percentage: {
      type: Number,
    },
    for: {
      type: Number,
    },
    against: {
      type: Number,
    },
    goals_for: {
      type: Number,
    },
    goals_against: {
      type: Number,
    },
    behinds_for: {
      type: Number,
    },
    behinds_against: {
      type: Number,
    },
    // Taken before every game in the round had been played.
    //
    // A snapshot is normally captured only once a round is finished, which left
    // a hole: one postponed game means the round never finishes, so no snapshot
    // is ever taken, and the next round is judged against a ladder two rounds
    // old with nothing anywhere saying so. A day after the round's last
    // scheduled bounce we stop believing the game will be played and take the
    // ladder as it stands - the same giving-up rule roundInProgress uses.
    //
    // Marked, because it is not final. If the game is eventually played the
    // round completes, and the sync replaces this snapshot rather than skipping
    // the round as already stored.
    provisional: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: "created_at" } }
);

// One row per team per round per season.
standingSchema.index({ year: 1, round: 1, id: 1 }, { unique: true });

const Standing = mongoose.model("Standing", standingSchema);

module.exports = Standing;

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// The cached global ladder - every user, season-ladder scoring, shown once
// signed in.
//
// Cached in MongoDB rather than in memory because Render's free tier spins the
// service down and restarts it often. An in-process cache would be cold again
// by the next visitor, which is exactly the case the cache exists for, and it
// would not survive a deploy either.
//
// One document per season, rewritten when a round completes. throughRound says
// how current it is: when it falls behind the last completed round - a missed
// sync, or a round scored while the service was down - the read path rebuilds
// rather than serving a stale ladder indefinitely.
const globalLadderSchema = new Schema(
  {
    season: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    throughRound: {
      type: Number,
      required: true,
    },
    standings: [
      {
        _id: false,
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        correctTips: Number,
        marginError: Number,
        // Stored rather than derived. Without it a cached read returned rows
        // with no round count while a freshly rebuilt one included it, so the
        // column was populated or empty depending on whether the cache
        // happened to be warm.
        roundsTipped: Number,
      },
    ],
    computedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

globalLadderSchema.set("toObject", { virtuals: true });
globalLadderSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("GlobalLadder", globalLadderSchema);

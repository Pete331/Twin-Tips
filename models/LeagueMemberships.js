const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// The many-to-many join between people and leagues. A user can belong to any
// number, of either type, at once.
const leagueMembershipSchema = new Schema(
  {
    league: {
      type: Schema.Types.ObjectId,
      ref: "League",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    // Display only - "joined in round 12". Scoring reads league.startRound and
    // never this, so someone joining late is scored on the same rounds as
    // everyone else in the league.
    joinedAtRound: {
      type: Number,
    },
  },
  { timestamps: true }
);

// One membership per person per league. Rejoining after being removed
// replaces nothing - the old document is gone, so this is what stops a double
// join racing itself.
leagueMembershipSchema.index({ league: 1, user: 1 }, { unique: true });

// "My leagues", which is hit on every page that shows a standings selector.
leagueMembershipSchema.index({ user: 1 });

leagueMembershipSchema.set("toObject", { virtuals: true });
leagueMembershipSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("LeagueMembership", leagueMembershipSchema);

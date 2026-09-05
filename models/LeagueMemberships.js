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
    // The round this member's results start counting from - "joined in round
    // 12", and scoring now means it.
    //
    // It was display only for a while and nothing read it, so a member who
    // joined a weekly pool at round 15 having tipped since round 1 was scored
    // on all fourteen rounds before they were in the league: shown as having
    // entered rounds they never paid into, and able to win pools they were not
    // in. Read by memberFrom in services/leagueStandings.js.
    joinedAtRound: {
      type: Number,
    },

    // Which season that round belongs to.
    //
    // A round number alone is ambiguous across seasons - round 3 of 2026 and
    // round 3 of 2027 are the same number - so without this the scorer could
    // only trust joinedAtRound while the league was in its first season, and
    // fell back to counting everyone from round one in every season after
    // that. Which is the same defect joinedAtRound exists to fix, returning a
    // year later: pool entries a late joiner never made, and buy-ins they
    // never paid.
    //
    // Absent on memberships written before this field existed. memberFrom
    // reads a missing value as league.createdSeason, which is exactly what the
    // old code assumed about those rows, so nothing shifts under them.
    // scripts/backfillJoinedAtSeason.js sets them explicitly.
    joinedAtSeason: {
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

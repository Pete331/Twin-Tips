const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const {
  newInviteToken,
  newJoinCode,
} = require("../utils/leagueCodes");

// A league is a scoring scope over tips that already exist. It holds a
// membership list and a set of rules for turning everyone's scores into a
// table; it does not hold tips. One set of tips per round is scored once and
// read by every league its owner belongs to.
//
// Deliberately not scoped to a season. A league is a group of people and
// outlives any one year - only the scoring resets each March.
const leagueSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },

    // Readable, with a random suffix. Anyone can create a league, so two
    // groups will both want "friday-night-tips"; the suffix means that is
    // never a collision to resolve at insert time. See utils/leagueCodes.js.
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: ["season", "weekly"],
    },

    // Points per round, per member who tips. Immutable after creation - the
    // route rejects any update touching it, because changing it mid-season
    // would silently rewrite what past rounds were worth.
    buyIn: {
      type: Number,
      required: true,
      min: 1,
    },

    // Exactly one, always. The admin cannot leave without transferring first,
    // which is enforced on the leave route rather than by hiding a button.
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The season the league was created in, and the round it starts scoring
    // from within that season. startRound stops a league created in round 15
    // from claiming tips entered before it existed - a concern that only
    // applies to the season it was created in. Every later season starts at
    // that season's own first round.
    createdSeason: {
      type: Number,
      required: true,
    },
    startRound: {
      type: Number,
      required: true,
    },

    // The credential. A link is one tap where a slug plus a password is two
    // pieces of data typed on a phone, and 32 random hex characters cannot be
    // guessed where a user-chosen password can. The join code is the same
    // credential in a form someone can read aloud.
    //
    // Both roll together when an admin regenerates, which is also the remedy
    // for a removed member who still holds a working link.
    inviteToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: newInviteToken,
    },
    joinCode: {
      type: String,
      required: true,
      default: newJoinCode,
    },

    // Soft delete. A hard delete would take its members' history with it, and
    // leagues will be deleted by accident. Null while live.
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Join codes are short, so they are not unique on their own - two live
// leagues could hold the same one. The lookup is by code among leagues that
// are not deleted, and the route treats more than one match as no match
// rather than guessing.
leagueSchema.index({ joinCode: 1, deletedAt: 1 });

leagueSchema.set("toObject", { virtuals: true });
leagueSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("League", leagueSchema);

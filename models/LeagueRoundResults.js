const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// What a member won in one league, in one round.
//
// This cannot live on the Tip. A tip is scored once and read by every league
// its owner belongs to, and the same tip wins a different amount in each -
// different membership lists, different pools, different winners. Correct
// tips and margin differences stay on the Tip because they describe the tip;
// winnings describe the contest.
const leagueRoundResultSchema = new Schema(
  {
    league: {
      type: Schema.Types.ObjectId,
      ref: "League",
      required: true,
    },
    season: {
      type: Number,
      required: true,
    },
    round: {
      type: Number,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // In buy-in units, not points: one entrant's stake is 1. Multiply by
    // league.buyIn to display. Storing it this way keeps the division exact
    // for as long as possible - a pool split three ways is a third, not
    // 16.666666666666668 - and it is how the app already worked before
    // leagues, with the multiplier applied at the client.
    winnings: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

// One result per member per round per league, and the write path upserts on
// exactly this - so scoring a round twice corrects rather than duplicates.
leagueRoundResultSchema.index(
  { league: 1, season: 1, round: 1, user: 1 },
  { unique: true }
);

// A round's results for one league.
leagueRoundResultSchema.index({ league: 1, season: 1, round: 1 });

// Accumulated standings, which is the read behind every league table.
leagueRoundResultSchema.index({ league: 1, season: 1, user: 1 });

leagueRoundResultSchema.set("toObject", { virtuals: true });
leagueRoundResultSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("LeagueRoundResult", leagueRoundResultSchema);

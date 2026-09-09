const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// What a member won in one league, in one round.
//
// This cannot live on the Tip. A tip is scored once and read by every league
// its owner belongs to, and the same tip wins a different amount in each -
// different membership lists, different pools, different winners. Correct
// tips and margin differences stay on the Tip because they describe the tip;
// winnings describe the contest.
// Reading these back is not the same as querying them.
//
// A row is written for every member who tipped a round, and nothing deletes it
// when they leave the league - deliberately: see the member-removal route in
// routes/leagues.js, which keeps a departed member's results because the
// league's history is a record of rounds that were played. So this collection
// holds rows for people who are no longer in the league, and a plain find()
// hands back strangers - one of whom, in a local league, is recorded as having
// won three rounds.
//
// services/leagueRounds.js exports resultsFor(league, season, members). It is
// the only thing that should read this collection: it drops rows belonging to
// former members, and rows for rounds a current member had not yet joined.
// services/leagueRounds.readers.test.js fails if anything else starts reading
// it directly.
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
    // In buy-in units, not dollars: one entrant's stake is 1. Multiply by
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

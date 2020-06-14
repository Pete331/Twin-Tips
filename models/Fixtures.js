const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const fixtureSchema = new Schema({
  games: [
    {
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
    },
  ],
});

const Fixture = mongoose.model("Fixture", fixtureSchema);

module.exports = Fixture;

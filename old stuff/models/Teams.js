const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const teamSchema = new Schema({
  id: {
    type: Number,
  },
  name: {
    type: String,
  },
  abbrev: {
    type: String,
  },
  logo: {
    type: String,
  },
});

const Team = mongoose.model("Team", teamSchema);

module.exports = Team;

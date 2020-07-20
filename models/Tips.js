const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tipSchema = new Schema({
  user: {
    type: String,
  },
  round: {
    type: Number,
  },
  topEightSelection: {
    type: String,
  },
  bottomTenSelection: {
    type: String,
  },
  marginTopEight: {
    type: Number,
  },
  marginBottomTen: {
    type: Number,
  },
});

const Tip = mongoose.model("Tip", tipSchema);

module.exports = Tip;

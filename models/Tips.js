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

tipSchema.virtual("userDetail", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
});

// To include virtuals in res.json(), you need to set the toJSON schema option to { virtuals: true }.
tipSchema.set("toObject", { virtuals: true });
tipSchema.set("toJSON", { virtuals: true });

const Tip = mongoose.model("Tip", tipSchema);

module.exports = Tip;

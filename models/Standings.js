const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const standingSchema = new Schema({
  id: {
    type: Number,
  },
  rank: {
    type: Number,
  },
});

const Standing = mongoose.model("Standing", standingSchema);

module.exports = Standing;

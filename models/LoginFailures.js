// Failed sign-ins, counted per identifier - see services/loginBackoff.js.
//
// Keyed on what was typed, lowercased, not on an account: an identifier that
// matches nobody is counted exactly like one that matches somebody, so how
// the backoff answers says nothing about who has an account.

const mongoose = require("mongoose");

const LoginFailureSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  lastAt: { type: Date, required: true },
  // Forgotten a day after the last failure, by MongoDB's TTL monitor, so an
  // old run of mistakes does not count against somebody next week.
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

module.exports = mongoose.model("LoginFailure", LoginFailureSchema);

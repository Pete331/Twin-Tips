const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      index: { unique: true },
      trim: true,
    },
    // select: false keeps these out of every query result by default, including
    // populate("userDetail") on the leaderboard and round results. Callers that
    // genuinely need them opt in with .select("+field").
    password: {
      type: String,
      required: true,
      trim: true,
      select: false,
    },
    resetPassToken: {
      type: String,
      select: false,
    },
    tokenExpiration: {
      type: Date,
      select: false,
    },
    favTeam: {
      type: Number,
      required: true,
    },
    admin: {
        type: Boolean,
        default: false,
      },
  },
  {
    timestamps: true,
  }
);


UserSchema.virtual("teamDetail", {
  ref: "Team",
  localField: "favTeam",
  foreignField: "id",
});

// To include virtuals in res.json(), you need to set the toJSON schema option to { virtuals: true }.
UserSchema.set("toObject", { virtuals: true });
UserSchema.set("toJSON", { virtuals: true });

const User = mongoose.model("User", UserSchema);

module.exports = User;

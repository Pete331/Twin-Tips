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
    // Stored exactly as typed, so the leaderboard shows the capitals someone
    // chose for their own name. Uniqueness is still case-insensitive: the
    // index below carries a collation of strength 2, which compares letters
    // without regard to case, so "PeteB" and "peteb" cannot both exist. That
    // is deliberately unlike email, which is lowercased on the way in - an
    // address has no display value, a username is the thing other people see.
    //
    // Every lookup has to pass the same collation or it will both miss the
    // index and match case-sensitively. utils/username.js exports it as
    // USERNAME_COLLATION; there is no lookup that should not use it.
    username: {
      type: String,
      required: true,
      trim: true,
    },
    // lowercase applies to query conditions as well as writes, so signing in
    // with a capital - which phone keyboards add by default - finds the same
    // account that registration created. Without it the unique index treats
    // Dave@x.com and dave@x.com as two addresses: the owner is locked out of
    // an account that plainly exists, and can then register a second one on
    // what they consider the same address.
    email: {
      type: String,
      required: true,
      index: { unique: true },
      trim: true,
      lowercase: true,
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


// Unique, and case-insensitive by collation rather than by lowercasing the
// stored value - so the leaderboard keeps whatever capitals someone chose
// while "PeteB" and "peteb" still cannot both be registered.
//
// A query only uses this index if it carries the same collation. See
// utils/username.js.
UserSchema.index(
  { username: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
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

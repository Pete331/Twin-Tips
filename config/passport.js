const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const db = require("../models");
const bcrypt = require("bcrypt");
const { USERNAME_COLLATION } = require("../utils/username");

// The field is still called "email" on the wire so existing clients keep
// working, but it now accepts a username too. The label the user sees says
// "Username or email".
const options = {
  usernameField: "email",
  passwordField: "password",
};

// An "@" is what separates the two. It cannot appear in a username - see
// utils/username.js - so this is unambiguous, and it means each lookup uses
// the right index rather than an $or that can use neither.
//
// The username query must carry the collation or it will both miss the unique
// index and compare case-sensitively, so someone who registered as "PeteB"
// could not sign in as "peteb".
const findByIdentifier = (identifier) => {
  const value = String(identifier || "").trim();

  if (value.includes("@")) {
    // The schema lowercases email on queries as well as writes, so a capital
    // from a phone keyboard still finds the account.
    return db.User.findOne({ email: value }).select("+password");
  }

  return db.User.findOne({ username: value })
    .collation(USERNAME_COLLATION)
    .select("+password");
};

// A real bcrypt hash of a value nobody can sign in with, compared against when
// the account does not exist.
//
// Without it, an unknown username answers as fast as the database can say no
// while a known one takes the length of a bcrypt compare - about 70ms, measured
// here. That difference is large, consistent, and enough to ask this app
// whether any given person has an account, one name at a time. Doing the work
// anyway makes both answers cost the same.
//
// Generated once at startup rather than written in as a constant, so there is
// no hash in source control that looks like it might matter.
const ABSENT_USER_HASH = bcrypt.hashSync(
  "no account has this password",
  bcrypt.genSaltSync(10)
);

passport.use(
  new LocalStrategy(options, async (identifier, password, done) => {
    try {
      // password is select:false on the schema, so opt in for the compare.
      const user = await findByIdentifier(identifier);

      // Deliberately not an early return. See ABSENT_USER_HASH above: the
      // comparison is thrown away, and doing it is the point.
      if (!user) {
        await bcrypt.compare(String(password || ""), ABSENT_USER_HASH);
        return done(null, false);
      }

      if (await bcrypt.compare(password, user.password)) {
        return done(null, user);
      }

      return done(null, false);
    } catch (err) {
      return done(err, false);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.User.findById(id);

    // A session can outlive its user (e.g. after account deletion), so bail
    // out instead of dereferencing null.
    if (!user) {
      return done(null, false);
    }

    let response = {
      id: user._id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      admin: user.admin,
    };

    done(null, response);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;

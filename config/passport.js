const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const db = require("../models");
const bcrypt = require("bcrypt");

const options = {
  usernameField: "email",
  passwordField: "password",
};

passport.use(
  new LocalStrategy(options, async (email, password, done) => {
    try {
      const user = await db.User.findOne({ email: email });

      if (!user) {
        return done(null, false);
      }

      if (bcrypt.compareSync(password, user.password)) {
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

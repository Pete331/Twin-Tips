var passport = require("passport");
const { Strategy: LocalStrategy } = require('passport-local');

const User = require('../models/Users');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

/**
 * Sign in using Email and Password.
 */
passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
  User.findOne({ email: email.toLowerCase() }, (err, user) => {
    if (err) { return done(err); }
    if (!user) {
      return done(null, false, { msg: `Email ${email} not found.` });
    }
    if (!user.password) {
      return done(null, false, { msg: 'Your account was registered using a sign-in provider. To enable password login, sign in using a provider, and then set a password under your user profile.' });
    }
    user.comparePassword(password, (err, isMatch) => {
      if (err) { return done(err); }
      if (isMatch) {
        return done(null, user);
      }
      return done(null, false, { msg: 'Invalid email or password.' });
    });
  });
}));





















// var db = require("../models");

// // Telling passport we want to use a Local Strategy. In other words, we want login with a username/email and password
// passport.use(
//   new LocalStrategy(
//     // Our user will sign in using an email, rather than a "username"
//     {
//       usernameField: "email",
//     },
//     function (email, password, done) {
//       // When a user tries to sign in this code runs
//       db.User.findOne({
//         email: email,
//       }).then(function (dbUser) {
//         // If there's no user with the given email
//         if (!dbUser) {
//           return done(null, false, {
//             message: "Incorrect email.",
//           });
//         }
//         // If there is a user with the given email, but the password the user gives us is incorrect
//         else if (!dbUser.validPassword(password)) {
//           return done(null, false, {
//             message: "Incorrect password.",
//           });
//         }
//         // If none of the above, return the user
//         return done(null, dbUser);
//       });
//     }
//   )
// );

// // In order to help keep authentication state across HTTP requests,
// // Sequelize needs to serialize and deserialize the user
// // Just consider this part boilerplate needed to make it all work
// passport.serializeUser(function (user, cb) {
//   cb(null, user);
// });

// passport.deserializeUser(function (obj, cb) {
//   cb(null, obj);
// });

// // Exporting our configured passport
// module.exports = passport;

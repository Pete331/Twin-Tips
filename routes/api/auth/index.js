const express = require("express");
const router = express.Router();
const passport = require("../../../config/passport");
const authController = require("../../../controllers/authController");
const { requireAuth } = require("../../../middleware/auth");
const backoff = require("../../../services/loginBackoff");
// The limiters go on the three routes an anonymous visitor can reach; see
// middleware/rateLimit.js for why each has the budget it has.
const {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  resetLimiter,
} = require("../../../middleware/rateLimit");

router
  .route("/")
  // @route  GET /api/auth
  // @desc   GET user data once authenticated
  // @access Private
  .get(authController.checkAuthState);

// The password check, with the per-account backoff around it
// (services/loginBackoff.js): an identifier with a wait running is turned away
// before its password is looked at, a failure is counted, and a success clears
// the count.
//
// passport.authenticate with a callback rather than on its own, which is what
// lets the outcome be recorded - and which means signing the session in is
// done here, by req.logIn, as the bare middleware did it.
const signIn = async (req, res, next) => {
  const key = backoff.keyFor(req.body && req.body.email);

  try {
    const wait = await backoff.waitRemaining(key);
    if (wait > 0) {
      res.set("Retry-After", String(Math.ceil(wait / 1000)));
      return res.status(429).json({
        success: false,
        message:
          "Too many failed sign-ins for that account. Try again in " +
          `${backoff.describeWait(wait)}, or reset your password.`,
      });
    }
  } catch (err) {
    return next(err);
  }

  passport.authenticate("local", async (err, user) => {
    if (err) return next(err);

    try {
      if (!user) {
        await backoff.recordFailure(key);
        return res.status(401).json({
          success: false,
          message: "Incorrect username, email or password",
        });
      }

      await backoff.clearFor(key);
    } catch (recordErr) {
      return next(recordErr);
    }

    req.logIn(user, (loginErr) => (loginErr ? next(loginErr) : next()));
  })(req, res, next);
};

router
  .route("/login")
  // @route  POST /api/auth/login
  // @desc   POST username & password & start a session
  // @access Public {successRedirect: "/dashboard"}
  .post(loginLimiter, signIn, authController.login);

router
  .route("/logout")
  // @route  POST /api/auth/logout
  // @desc   Clears login session
  // @access Private
  //
  // POST rather than GET, because it changes state. A GET that signs somebody
  // out can be fired by anything that fetches a URL without them meaning it: an
  // <img src> on another site, a chat client unfurling a link preview, a
  // browser prefetching what it thinks you are about to click. None of those is
  // an attack worth much - the worst case is being signed out - but none of
  // them is something the person asked for either, and the verb is the only
  // reason they can happen at all.
  //
  // client/src/utils/AuthAPI.js is the only caller, and posts to it. The two
  // have to move together.
  .post(authController.logout);

router
  .route("/register")
  // @route  POST /api/auth/register
  // @desc   POST new user to database
  // @access Public
  .post(registerLimiter, authController.register);

router
  .route("/forgot")
  // @route  POST /api/auth/forgot
  // @desc   POST route to send a token as a temp password
  // @access Public
  .post(forgotLimiter, authController.forgotPassword);

router
  .route("/reset")
  // @route  POST /api/auth/reset
  // @desc   POST route to reset password
  // @access Public
  .post(resetLimiter, authController.resetPassword);

router
  .route("/username")
  // @route  POST /api/auth/username
  // @desc   POST change your own username while signed in
  // @access Private
  .post(requireAuth, authController.changeUsername);

router
  .route("/password")
  // @route  POST /api/auth/password
  // @desc   POST change your own password while signed in
  // @access Private
  .post(requireAuth, authController.changePassword);

module.exports = router;

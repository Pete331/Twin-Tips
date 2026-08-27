const express = require("express");
const router = express.Router();
const passport = require("../../../config/passport");
const authController = require("../../../controllers/authController");
const { requireAuth } = require("../../../middleware/auth");
// The limiters go on the three routes an anonymous visitor can reach; see
// middleware/rateLimit.js for why each has the budget it has.
const {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
} = require("../../../middleware/rateLimit");

router
  .route("/")
  // @route  GET /api/auth
  // @desc   GET user data once authenticated
  // @access Private
  .get(authController.checkAuthState);

router
  .route("/login")
  // @route  POST /api/auth/login
  // @desc   POST username & password & start a session
  // @access Public {successRedirect: "/dashboard"}
  .post(loginLimiter, passport.authenticate("local"), authController.login);

router
  .route("/logout")
  // @route  GET /api/auth/logout
  // @desc   Clears login session
  // @access Private
  .get(authController.logout);

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
  .post(authController.resetPassword);

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

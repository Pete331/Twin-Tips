let db = require("../models");
const mongoose = require("mongoose");
const passport = require("passport");
const validator = require("validator");

module.exports = function (app) {
  // store signup information
  app.post("/api/user/signup", function (req, res) {
    const userData = req.body;
    console.log(userData);
    db.User.create(userData)
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

// TO DO: HAVE A GO AT GETTING THE BELOW TO WORK AND REQ.FLASH WITH HANDLEBARS

  // POST /api/login
  // logs user in

  // app.post("/api/login", (req, res, next) => {
  //   const validationErrors = [];
  //   if (!validator.isEmail(req.body.email))
  //     validationErrors.push({ msg: "Please enter a valid email address." });
  //   if (validator.isEmpty(req.body.password))
  //     validationErrors.push({ msg: "Password cannot be blank." });

  //   if (validationErrors.length) {
  //     console.log("we have errors here");
  //     req.flash("errors", validationErrors);
  //     return res.redirect("/");
  //   }
  //   req.body.email = validator.normalizeEmail(req.body.email, {
  //     gmail_remove_dots: false,
  //   });

  //   passport.authenticate("local", (err, user, info) => {
  //     console.log(user);
  //     req.flash("errors", info);
  //     if (err) {
  //       console.log("1");
  //       return next(err);
  //     }
  //     if (!user) {
  //       console.log("2");
  //       req.flash("errors", info);
  //       return res.redirect("/");
  //     }
  //     req.logIn(user, (err) => {
  //       console.log("here now");
  //       if (err) {
  //         console.log("all correct but errors");
  //         return next(err);
  //       }
  //       req.flash("success", { msg: "Success! You are logged in." });
  //       res.redirect(req.session.returnTo || "/dashboard");
  //       console.log("object");
  //     });
  //   })(req, res, next);
  // });

  app.post("/api/login", passport.authenticate("local"), function (req, res) {
    res.json({
      email: req.user.email,
      id: req.user.id,
    });
  });

  // GET /logout
  // logs user out
  app.get("/logout", (req, res) => {
    req.logout();
    req.session.destroy((err) => {
      if (err)
        console.log(
          "Error : Failed to destroy the session during logout.",
          err
        );
      req.user = null;
      res.redirect("/");
    });
  });

  //   fills fixtures in database after deleting the previous ones
  app.post("/api/fixtures", function (req, res) {
    const apiData = req.body.games;
    console.log(apiData);
    db.Fixture.deleteMany({})
      .then(() => db.Fixture.create(apiData))
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });
  // fills teams in database
  app.post("/api/teams", function (req, res) {
    const apiData = req.body.teams;
    console.log(apiData);
    db.Team.create(apiData)
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // fills standings in database
  app.post("/api/standings", function (req, res) {
    const apiData = req.body.standings;
    console.log(apiData);
    db.Standing.create(apiData)
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // gets winning teams
  app.get("/api/winners", function (req, res) {
    db.Fixture.find({}, "winner")
      .then((data) => {
        console.log(data);
        res.json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets fixtures with team details and standings
  app.get("/api/details", function (req, res) {
    db.Fixture.find({})
      .populate("home-team")
      .populate("away-team")
      .populate({ path: "home-team-standing" })
      .populate("away-team-standing")
      .then((data) => {
        console.log(data);
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });
};

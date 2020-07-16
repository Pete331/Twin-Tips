let db = require("../models");
const mongoose = require("mongoose");
const passport = require('passport');

module.exports = function (app) {
  // store signup information
  // app.post("/api/user/signup", function (req, res) {
  //   const userData = req.body;
  //   console.log(userData);
  //   db.User.create(userData)
  //     .then((data) => res.json(data))
  //     .catch((err) => {
  //       res.json(err);
  //     });
  // });

  // app.post("/api/login", passport.authenticate("local"), function (req, res) {
  //   res.json({
  //     email: req.user.email,
  //     id: req.user.id,
  //   });
  // });

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
    db.Fixture.deleteMany({})
      .then(() =>
    db.Team.create(apiData))
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // fills standings in database
  app.post("/api/standings", function (req, res) {
    const apiData = req.body.standings;
    console.log(apiData);
    db.Standing.deleteMany({})
      .then(() => db.Standing.create(apiData))
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

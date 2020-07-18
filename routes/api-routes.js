let db = require("../models");
const mongoose = require("mongoose");
const passport = require("passport");

module.exports = function(app) {
  //   fills fixtures in database after deleting the previous ones
  app.post("/api/fixtures", function(req, res) {
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
  app.post("/api/teams", function(req, res) {
    const apiData = req.body.teams;
    console.log(apiData);
    db.Team.deleteMany({})
      .then(() => db.Team.create(apiData))
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // fills standings in database
  app.post("/api/standings", function(req, res) {
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
  app.get("/api/winners", function(req, res) {
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
  app.get("/api/details", function(req, res) {
    db.Fixture.find({})
      .populate("home-team")
      .populate("away-team")
      .populate({ path: "home-team-standing" })
      .populate("away-team-standing")
      .then((data) => {
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets fixtures with team details and standings for a particular round
  app.get("/api/details/:round", function(req, res) {
    console.log("here");
    const round = req.params.round;
    console.log(round);
    db.Fixture.find({ round: round }).sort({date: 1})
      .populate("home-team")
      .populate("away-team")
      .populate({ path: "home-team-standing" })
      .populate("away-team-standing")
      .then((data) => {
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });
};

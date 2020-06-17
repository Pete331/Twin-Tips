let db = require("../models");
const mongoose = require("mongoose");

module.exports = function (app) {
  //   fills fixtures in database
  app.post("/api/fixtures", function (req, res) {
    const apiData = req.body.games;
    console.log(apiData);
    db.Fixture.create(apiData)
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

  // fills teams in database
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
    console.log("Hitting this");
    db.Fixture.find({}, "winner")
      .then((data) => {
        console.log(data);
        res.json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets fixtures with team details
  app.get("/api/details", function (req, res) {
    console.log("Hitting this");
    db.Fixture.find({})
      .populate("home-team")
      .populate("away-team")
      .populate("home-team-standing")
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

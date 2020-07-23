let db = require("../models");
const mongoose = require("mongoose");
const passport = require("passport");
const moment = require("moment");

module.exports = function (app) {
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
    db.Team.deleteMany({})
      .then(() => db.Team.create(apiData))
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
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets fixtures with team details and standings for a particular round
  app.get("/api/details/:round", function (req, res) {
    const round = req.params.round;
    db.Fixture.find({ round: round })
      .sort({ date: 1 })
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

  // fills selected user tips into database
  app.post("/api/tips", function (req, res) {
    const apiData = req.body;
    // console.log(apiData);

    const query = { user: apiData.user, round: apiData.round },
      update = {
        topEightSelection: apiData.topEightSelection,
        bottomTenSelection: apiData.bottomTenSelection,
        marginTopEight: apiData.marginTopEight,
        marginBottomTen: apiData.marginBottomTen,
      },
      options = {
        //  upsert = true option creates the object if it doesn't exist
        upsert: true,
        new: true,
      };

    db.Tip.findOneAndUpdate(query, update, options, function (error, result) {
      if (error) console.log(error);
      // console.log(result);
    }).then((data) => res.json(data));
  });

  // gets next game from now to set active round
  app.get("/api/currentRound", function (req, res) {
    // console.log(moment().toDate());
    db.Fixture.find({
      date: {
        $gte: moment().toDate(),
      },
    })
      .sort({ date: 1 })
      .then((data) => {
        // console.log(data[0]);
        res.status(200).json(data[0]);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets results from the previous round
  app.post("/api/lastRoundResult", function (req, res) {
    const apiData = req.body;
    // console.log(apiData);
    db.Tip.find({ round: apiData.previousRound }).populate("userDetail")
      .then((data) => {
        // console.log(data);
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets results from the previous round
  app.post("/api/currentRoundTips", function (req, res) {
    const apiData = req.body;
    // console.log(apiData);
    db.Tip.findOne({ user: apiData.user, round: apiData.round })
      
      .then((data) => {
        // console.log(data);
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });
};

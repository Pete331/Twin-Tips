let db = require("../models");
const mongoose = require("mongoose");
const passport = require("passport");
const moment = require("moment");

// const hoursToOffset = -6;
const hoursToOffset = 0;

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
  app.post("/api/tips", function(req, res) {
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

    db.Tip.findOneAndUpdate(query, update, options, function(error, result) {
      if (error) console.log(error);
      // console.log(result);
    }).then((data) => res.json(data));
  });

  // gets next game from now to set active round
  app.get("/api/currentRound", function(req, res) {
    // console.log("now:" + moment().toDate());
    nowConvertedToFixtureDate = moment().add(2 + hoursToOffset, "hours");
    // console.log(nowConvertedToFixtureDate);
    db.Fixture.find({
      date: {
        $gte: nowConvertedToFixtureDate,
      },
    })
      .sort({ date: 1 })
      .then((upperRound) => {
        db.Fixture.find({
          date: {
            $lte: nowConvertedToFixtureDate,
          },
        })
          .sort({ date: -1 })
          .then((lowerRound) => {
            // console.log(upperRound[0] + lowerRound[0]);
            const closestDateRounds = {
              upperRound: upperRound[0],
              lowerRound: lowerRound[0],
            };
            res.status(200).json(closestDateRounds);
          });
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // const updatedDate = Moment(date)
  // .utcOffset(360)
  // .format("dddd MMMM Do YYYY, h:mm a");

  // gets results from the previous round
  app.post("/api/roundResult", function(req, res) {
    const apiData = req.body;
    // console.log(apiData);
    db.Tip.find({ round: apiData.round })
      .populate("userDetail")
      .then((data) => {
        // console.log(data);
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets current round tips for user
  app.post("/api/userRoundTips", function(req, res) {
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

  // gets all results
  app.post("/api/calculateResults", function(req, res) {
    const resultRound = req.body;
    console.log(resultRound);
    db.Fixture.find(resultRound)
      .sort({ date: 1 })
      .then((fixture) =>
        db.Tip.find(resultRound).then((tips) => {
          const data = { data: { fixture, tips } };
          // console.log(data);
          res.status(200).json(data);
        })
      )
      .catch((err) => {
        res.json(err);
      });
  });

  // inputs calculated results into database
  app.post("/api/inputCalculatedResults/", function(req, res) {
    const apiData = req.body;
    // console.log(apiData);
    const query = { user: apiData.user, round: apiData.round },
      // set roundwinner to false as default so that it recalcs winner
      update = {
        topEightCorrect: apiData.topEightCorrect,
        bottomTenCorrect: apiData.bottomTenCorrect,
        topEightDifference: apiData.topEightDifference,
        bottomTenDifference: apiData.bottomTenDifference,
        correctTips: apiData.correctTips,
        winnings: 0,
      },
      options = {
        //  upsert = true option creates the object if it doesn't exist
        upsert: true,
        new: true,
      };

    db.Tip.findOneAndUpdate(query, update, options, function(error, result) {
      if (error) console.log(error);
    }).then((data) => res.json(data));
  });

  // inputs round winner into database
  app.post("/api/roundWinner/", function(req, res) {
    const apiData = req.body;
    const query = { user: { $in: apiData.user }, round: apiData.round.round },
      update = {
        winnings: apiData.winnings,
      },
      options = {
        //  upsert = true option creates the object if it doesn't exist
        upsert: true,
        new: true,
      };
    console.log(query);

    db.Tip.updateMany(query, update, options, function(error, result) {
      if (error) console.log(error);
    }).then((data) => res.json(data));
  });

  // gets leaderboard info
  app.get("/api/leaderboard/", function(req, res) {
    db.Tip.find()
      .sort({ user: 1 })
      .populate("userDetail")
      .then((data) => {
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets user details
  app.post("/api/users", function(req, res) {
    const apiData = req.body;
    db.User.findOne({ _id: apiData.id })
      .populate("teamDetail")
      .then((data) => {
        // console.log(data);
        res.json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });
};

let db = require("../models");
const mongoose = require("mongoose");
const passport = require("passport");
const moment = require("moment");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const seasonService = require("../services/season");

// The season the client asked for, or the current one when it didn't ask. Keeps
// a stale client from pinning the app to whatever year it was built with.
const resolveSeason = async (value) => {
  // Deliberately strict: Number(null) and Number("") are both 0, which would
  // otherwise sail through Number.isInteger and query season 0.
  if (value !== null && value !== undefined && value !== "") {
    const year = Number(value);
    if (Number.isInteger(year) && year > 1900) return year;
  }
  const state = await seasonService.getSeasonState();
  return state.season;
};

// Round numbers arrive from the client, so coerce rather than trusting them:
// round 0 is legitimate (the Opening Round), hence the Number.isInteger check
// rather than a truthiness test.
const asRound = (value) => {
  const round = Number(value);
  return Number.isInteger(round) ? round : null;
};

// const hoursToOffset = 102;
const hoursToOffset = 0;

module.exports = function (app) {
  //   fills fixtures in database after deleting the previous ones in the current season
  app.post("/api/fixtures", requireAuth, function (req, res) {
    const apiData = req.body.data.games;
    // console.log(apiData);
    const season = req.body.season;
    // console.log(season);
    db.Fixture.deleteMany({ year: season })
      .then(() => db.Fixture.create(apiData))
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  //   updates currentround scores in database
  app.post("/api/roundFixtures", requireAuth, async function (req, res) {
    const roundGames = req.body.games;
    // Every update has to settle before we answer: the old forEach responded
    // once per game, so all but the first response threw ERR_HTTP_HEADERS_SENT.
    try {
      await Promise.all(
        roundGames.map((game) =>
          db.Fixture.updateMany(
            { id: game.id },
            {
              hscore: game.hscore,
              ascore: game.ascore,
              complete: game.complete,
              winner: game.winner,
              hgoals: game.hgoals,
              hbehinds: game.hbehinds,
              agoals: game.agoals,
              abehinds: game.abehinds,
            }
          )
        )
      );
      res.json();
    } catch (err) {
      res.json(err);
    }
  });

  // fills teams in database
  app.post("/api/teams", requireAdmin, function (req, res) {
    const apiData = req.body.teams;
    console.log(apiData);
    db.Team.deleteMany({})
      .then(() => db.Team.create(apiData))
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // gets standings in database
  app.get("/api/standingsDb", requireAuth, function (req, res) {
    db.Standing.find({})
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // fills standings in database
  app.post("/api/standings", requireAuth, function (req, res) {
    const apiData = req.body.standings;
    console.log(apiData);
    db.Standing.deleteMany({})
      .then(() => db.Standing.create(apiData))
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // gets fixtures with team details and standings
  app.get("/api/details", requireAuth, function (req, res) {
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
  app.post("/api/detailsRound", requireAuth, async function (req, res) {
    // Built field by field: the whole request body used to be handed to find(),
    // so a client could send query operators and shape the result set.
    const query = { year: await resolveSeason(req.body.year) };
    const round = asRound(req.body.round);
    if (round !== null) query.round = round;

    db.Fixture.find(query)
      .sort({ date: 1 })
      .populate("home-team")
      .populate("away-team")
      .populate({ path: "home-team-standing" })
      .populate("away-team-standing")
      .then((data) => {
        // console.log(data);
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // fills selected user tips into database
  app.post("/api/tips", requireAuth, function (req, res) {
    const apiData = req.body;

    // Identity comes from the session, never the body - otherwise any signed-in
    // user could submit or overwrite someone else's tips.
    const query = { user: req.user.id, round: apiData.round },
      update = {
        topEightSelection: apiData.topEightSelection,
        bottomTenSelection: apiData.bottomTenSelection,
        marginTopEight: apiData.marginTopEight,
        marginBottomTen: apiData.marginBottomTen,
        season: apiData.season,
      },
      options = {
        //  upsert = true option creates the object if it doesn't exist
        // You should set the new option to true to return the document after update was applied.
        upsert: true,
        new: true,
      };

    db.Tip.findOneAndUpdate(query, update, options)
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // gets next game from now to set active round
  // 3 needs to be chnged to 2 when daylight savings ends?
  app.post("/api/currentRound", requireAuth, function (req, res) {
    const apiData = req.body;
    // console.log("now:" + moment().toDate());
    // console.log(hoursToOffset);
    nowConvertedToFixtureDate = moment().add(3 + hoursToOffset, "hours");
    // console.log(nowConvertedToFixtureDate);
    // console.log(apiData.season);
    db.Fixture.find({
      // year: apiData.season,
      date: {
        $gte: nowConvertedToFixtureDate,
      },
    })
      .sort({ date: 1 })
      .then((upperRound) => {
        // Returned so a rejection below reaches the catch. Without this the
        // inner promise was unsupervised and any throw killed the process.
        return db.Fixture.find({
          date: {
            $lte: nowConvertedToFixtureDate,
          },
        })
          .sort({ date: -1 })
          .then((lowerRound) => {
            const nextGame = upperRound[0];
            const lastGame = lowerRound[0];

            // No fixture is still ahead of us, so the loaded season has
            // finished. Previously this dereferenced undefined and crashed.
            if (!nextGame) {
              const closestDateRounds = {
                upperRound: { round: 23 },
                lowerRound: { round: 23 },
              };
              return res.status(200).json(closestDateRounds);
            }

            if (apiData.season != nextGame.year) {
              // asking for a season other than the one loaded - show it whole
              const closestDateRounds = {
                upperRound: { round: 23 },
                lowerRound: { round: 23 },
              };
              return res.status(200).json(closestDateRounds);
            }

            if (
              lastGame &&
              lastGame.year === moment().year() &&
              nextGame.year === moment().year()
            ) {
              const closestDateRounds = {
                upperRound: nextGame,
                lowerRound: lastGame,
              };
              return res.status(200).json(closestDateRounds);
            }

            // same season, but the first game has not been played yet
            const closestDateRounds = {
              upperRound: nextGame,
              lowerRound: { round: 0, date: "2020-01-01T11:25:00.000Z" },
            };
            return res.status(200).json(closestDateRounds);
          });
      })
      .catch((err) => {
        res.status(500).json({
          success: false,
          message: "Unable to determine the current round.",
        });
      });
  });

  // const updatedDate = Moment(date)
  // .utcOffset(360)
  // .format("dddd MMMM Do YYYY, h:mm a");

  // gets results from the previous round
  app.post("/api/roundResult", requireAuth, async function (req, res) {
    const apiData = req.body;
    db.Tip.find({
      round: asRound(apiData.round),
      season: await resolveSeason(apiData.season),
    })
      .populate({ path: "userDetail" })
      .then((data) => {
        // console.log(data);
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets current round tips for user
  app.post("/api/userRoundTips", requireAuth, async function (req, res) {
    const apiData = req.body;
    db.Tip.findOne({
      // Own tips only - tips are meant to be private until lockout.
      user: req.user.id,
      round: asRound(apiData.data && apiData.data.round),
      season: await resolveSeason(apiData.season),
    })
      .then((data) => {
        // console.log(data);
        res.status(200).json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  // gets all results
  app.post("/api/calculateResults", requireAuth, async function (req, res) {
    // Same as detailsRound: the raw body used to be the query.
    const year = await resolveSeason(req.body.year);
    const round = asRound(req.body.round);
    const query = { year };
    if (round !== null) query.round = round;

    db.Fixture.find(query)
      .sort({ date: 1 })
      .then((fixture) =>
        db.Tip.find({
          round: round,
          season: year,
        }).then((tips) => {
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
  app.post("/api/inputCalculatedResults/", requireAuth, function (req, res) {
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

    db.Tip.findOneAndUpdate(query, update, options)
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // inputs round winner into database
  app.post("/api/roundWinner/", requireAuth, function (req, res) {
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
    // console.log(query);
    // console.log(update);

    db.Tip.updateMany(query, update, options)
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // gets leaderboard info
  app.post("/api/leaderboard/", requireAuth, async function (req, res) {
    db.Tip.find({ season: await resolveSeason(req.body.season) })
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
  app.post("/api/users", requireAuth, function (req, res) {
    // Always the signed-in user: the id used to come from the body, so anyone
    // could read any account.
    db.User.findOne({ _id: req.user.id })
      .populate("teamDetail")
      .then((data) => {
        res.json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });

  app.delete("/api/deleteUser", requireAuth, function (req, res) {
    // Only ever deletes the caller's own account.
    const userId = req.user.id;

    req.session.destroy(async () => {
      res.clearCookie("connect.sid");
      try {
        // Remove the tips first: if the user delete succeeded and this failed,
        // the tips would be orphaned with no owner to clean them up.
        await db.Tip.deleteMany({ user: String(userId) });
        await db.User.findOneAndDelete({ _id: userId });
        // The old version never answered, so the client hung until it timed out.
        res
          .status(200)
          .json({ success: true, message: "Account successfully deleted." });
      } catch (err) {
        res
          .status(500)
          .json({ success: false, message: "Unable to delete account." });
      }
    });
  });
};

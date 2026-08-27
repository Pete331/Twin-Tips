let db = require("../models");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const seasonService = require("../services/season");
const standingsService = require("../services/standings");

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

module.exports = function (app) {
  // POST /api/fixtures and POST /api/roundFixtures are gone. Both existed so
  // the browser could pull a round from Squiggle and write it back, and both
  // sat behind requireAuth rather than requireAdmin - so any signed-in user
  // could replace a season's fixtures with whatever they posted, or rewrite
  // the scores that decide who wins tips. Nothing ever read their responses;
  // the pages render from the database either way.
  //
  // The server syncs fixtures and scores itself on a schedule now, which is
  // where privileged writes belong. See services/seasonSync.js.

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

  // The clubs, for pickers. The teams have always been in the database but
  // there was no way to read them back.
  app.get("/api/teams", requireAuth, function (req, res) {
    db.Team.find({})
      .sort({ name: 1 })
      .then((data) => res.json(data))
      .catch((err) => {
        console.error("teams lookup failed:", err.message);
        res
          .status(500)
          .json({ success: false, message: "Unable to load teams." });
      });
  });

  // The ladder for a round - defaults to the one the current round is played
  // against.
  app.get("/api/standingsDb", requireAuth, async function (req, res) {
    try {
      const year = await resolveSeason(req.query.year);
      let round = asRound(req.query.round);
      if (round === null) {
        const state = await seasonService.getSeasonState(year);
        round = state.currentRound !== null ? state.currentRound : 0;
      }
      res.json(await standingsService.getLadderForRound(year, round));
    } catch (err) {
      console.error("standingsDb failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to load the ladder." });
    }
  });

  // POST /api/standings is gone. It did deleteMany({}) then create(), so a
  // failed create left no ladder at all, and it was driven from the browser on
  // a 3-day timer that had no relationship to when rounds actually end. Ladder
  // snapshots are captured server-side per round now - see
  // services/seasonSync.js and POST /api/season/sync.

  // GET /api/details is gone. It read every fixture of every season at once
  // and populated the two standing virtuals, which matched on team id with no
  // year or round - so each fixture came back carrying every ladder snapshot
  // ever stored for both clubs. Nothing called it, and POST /api/detailsRound
  // below is the version that attaches the right ladder for the round.

  // gets fixtures with team details and standings for a particular round
  app.post("/api/detailsRound", requireAuth, async function (req, res) {
    // Built field by field: the whole request body used to be handed to find(),
    // so a client could send query operators and shape the result set.
    const query = { year: await resolveSeason(req.body.year) };
    const round = asRound(req.body.round);
    if (round !== null) query.round = round;

    try {
      const fixtures = await db.Fixture.find(query)
        .sort({ date: 1 })
        .populate("home-team")
        .populate("away-team");

      // The ladder is attached explicitly rather than through a populate, so
      // each round gets the ladder that applied when it opened. The old
      // virtuals joined on team id alone, which returns every season's rows now
      // that snapshots are kept per round.
      const ladder = await standingsService.getLadderMap(
        query.year,
        round !== null ? round : 0
      );

      // Kept as single-element arrays: that is the shape the populate produced
      // and what the client reads as game["home-team-standing"][0].rank.
      const withLadder = fixtures.map((fixture) => {
        const doc = fixture.toObject({ virtuals: true });
        const home = ladder.get(doc.hteamid);
        const away = ladder.get(doc.ateamid);
        doc["home-team-standing"] = home ? [home] : [];
        doc["away-team-standing"] = away ? [away] : [];
        return doc;
      });

      res.status(200).json(withLadder);
    } catch (err) {
      console.error("detailsRound failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to load the round." });
    }
  });

  // fills selected user tips into database
  app.post("/api/tips", requireAuth, async function (req, res) {
    const apiData = req.body;
    const season = await resolveSeason(apiData.season);
    const round = asRound(apiData.round);

    // The rules below were enforced only in the browser, so anything posting
    // directly could store a tip the scoring cannot make sense of - and a
    // round that failed to parse became a tip filed under round null, which
    // no round will ever score.
    if (round === null) {
      return res
        .status(400)
        .json({ success: false, message: "A valid round is required." });
    }

    if (!apiData.topEightSelection || !apiData.bottomTenSelection) {
      return res
        .status(400)
        .json({ success: false, message: "Select a team for each group." });
    }

    // One margin per round, on one of the two games. Zero means "no margin on
    // this one", which is the rule the tips page already applies - typing in
    // either margin field clears the other, and it refuses to submit when both
    // are blank. services/results.js reads the same rule back when it decides
    // which selection the margin was on.
    //
    // Both checks exist because the browser was the only thing enforcing any
    // of this: anything posting directly could send two margins, and scoring
    // would silently count the top-eight one and ignore the other.
    const topMargin = Number(apiData.marginTopEight) > 0;
    const bottomMargin = Number(apiData.marginBottomTen) > 0;

    if (!topMargin && !bottomMargin) {
      return res.status(400).json({
        success: false,
        message: "Enter a margin for one of the two games.",
      });
    }

    if (topMargin && bottomMargin) {
      return res.status(400).json({
        success: false,
        message: "Enter a margin for one game only, not both.",
      });
    }

    // Identity comes from the session, never the body - otherwise any signed-in
    // user could submit or overwrite someone else's tips. The season belongs in
    // the query too: without it, tipping round 5 of one season overwrote the
    // same user's round 5 tip from every other season.
    const query = { user: req.user.id, round, season },
      update = {
        topEightSelection: apiData.topEightSelection,
        bottomTenSelection: apiData.bottomTenSelection,
        // Both margins written explicitly, with the unused one zeroed. Passing
        // the raw values through left a stale margin in place when someone
        // moved their prediction to the other game: Mongoose skips an
        // undefined field, so the old value survived and the document ended up
        // holding two margins - which is how the one such row in the database
        // got there. Scoring would then quietly use the top-eight one.
        marginTopEight: topMargin ? Number(apiData.marginTopEight) : 0,
        marginBottomTen: bottomMargin ? Number(apiData.marginBottomTen) : 0,
        season,
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
  // POST /api/currentRound is gone. It worked out the live round by adding a
  // hand-set number of hours to now - `moment().add(3 + hoursToOffset)` - with
  // a note wondering whether the 3 should become a 2 when daylight saving
  // ended. That is a timezone correction maintained by hand. GET /api/season
  // answers the same question from fixture dates that are now stored as real
  // instants, so no offset is needed anywhere.

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

  // POST /api/calculateResults is gone too. Despite the name it only read
  // fixtures and tips back out - the scoring it was named for moved to
  // services/results.js - and nothing has called it since.

  // POST /api/inputCalculatedResults and POST /api/roundWinner are gone.
  // Scoring ran in the browser and wrote results for every user in the
  // competition, triggered from whichever dashboard happened to load. It also
  // fired the per-user writes without awaiting them and then re-read the round
  // to pick a winner, so the winner could be decided from writes that had not
  // landed. Neither query carried a season, so scoring a round number that
  // exists in two seasons overwrote the older one. Scoring now happens in
  // services/results.js, keyed on user, round and season.

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

  // Updates the signed-in user's own profile. Deliberately narrow: only
  // favTeam can be set. A general "apply the body to the user" update is how
  // register let clients grant themselves admin, so the allowed fields are
  // named here rather than taken from the request.
  app.patch("/api/users/me", requireAuth, async function (req, res) {
    const favTeam = Number(req.body.favTeam);

    if (!Number.isInteger(favTeam)) {
      return res
        .status(400)
        .json({ success: false, message: "Choose a team." });
    }

    try {
      const team = await db.Team.findOne({ id: favTeam });
      if (!team) {
        return res
          .status(400)
          .json({ success: false, message: "That is not a team." });
      }

      await db.User.updateOne({ _id: req.user.id }, { $set: { favTeam } });
      res
        .status(200)
        .json({ success: true, message: `Favourite team set to ${team.name}.` });
    } catch (err) {
      console.error("profile update failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to update your profile." });
    }
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
        // Logged, like every other failure here. A deletion that fails is one
        // of the few things a user cannot retry their way out of - they are
        // told it did not work and have nothing else to go on - so the reason
        // needs to reach somewhere we can read it.
        console.error("deleteUser failed:", err.message);
        res
          .status(500)
          .json({ success: false, message: "Unable to delete account." });
      }
    });
  });
};

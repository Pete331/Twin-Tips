let db = require("../models");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { requireAuth } = require("../middleware/auth");
const { endOtherSessions } = require("../services/sessions");
const seasonService = require("../services/season");
const standingsService = require("../services/standings");
const liveScores = require("../services/liveScores");
const { validateSelections, selectionsVisible } = require("../services/tipRules");

// The biggest margin a tip may predict. The largest in VFL/AFL history is 190
// points, so 200 is past anything that has happened without being a number
// anyone would type by accident. Matches the max the tips page already puts on
// the input.
const MAX_MARGIN = 200;

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

  // POST /api/teams is gone. It emptied the teams collection and then created
  // whatever the request body held, so a body that failed validation left the
  // app with no teams at all - and it answered that failure with a 200 and the
  // raw error. Nothing called it: teams come from Squiggle through
  // services/seasonSync.syncTeams, which upserts on the team id and never
  // deletes. The read below is the only teams route the app uses.

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
      // Bring the scores up to date first, if a game in this round is actually
      // being played and what we hold has gone stale.
      //
      // The scheduled sync is hourly, which is right for fixtures and ladders
      // and useless for a scoreline: a game that bounced at 6:10pm showed no
      // score until the 7:00pm run. Refreshing here instead means a page load
      // during a game gets a score no more than a couple of minutes old.
      //
      // In front of the database rather than instead of it. The stored fixtures
      // stay the single source of truth - they are what tips are graded against
      // - and one refresh serves every request in the window, so this costs
      // Squiggle the same whether one person is watching or fifty.
      //
      // It never throws: a failure leaves the stored round in place, which is
      // still correct, only older.
      await liveScores.refreshIfLive(query.year, round);

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
    // A margin is a whole number of points, and 200 is past anything that has
    // ever happened - the record is 190. The tips page has carried min 0 and
    // max 200 on the input since it was written; the server checked neither
    // end, so a margin of a trillion was accepted and stored verbatim. Not
    // exploitable, since a wilder guess only costs you tiebreaks, but it is
    // data nothing in the app is built to display.
    const marginProblem = (raw, which) => {
      if (raw === undefined || raw === null || raw === "") return null;

      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return `The ${which} margin must be a number.`;
      }
      // Zero is how the page says "no margin on this one", so it passes here
      // and the one-of-two checks below deal with it.
      if (value === 0) return null;
      if (value < 0) return "A margin cannot be negative.";
      if (!Number.isInteger(value)) {
        return "A margin is a whole number of points.";
      }
      if (value > MAX_MARGIN) {
        return `A margin of ${value} is too big - ${MAX_MARGIN} at most.`;
      }
      return null;
    };

    const marginFault =
      marginProblem(apiData.marginTopEight, "top 8") ||
      marginProblem(apiData.marginBottomTen, "bottom 10");

    if (marginFault) {
      return res.status(400).json({ success: false, message: marginFault });
    }

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

    // Everything above checks the shape of the request. Everything below
    // checks it against the competition, which needs the season state, the
    // round's fixtures, the ladder, and the previous round's tip.
    try {
      const state = await seasonService.getSeasonState(season);

      // The deadline was not enforced on the server at all. A tip could be
      // posted after the first bounce - after results were known - and the
      // only thing standing in the way was a disabled button.
      if (!state.tippingOpen) {
        return res.status(403).json({
          success: false,
          message: state.message || "Tipping is closed.",
        });
      }

      // Nor was the round. Any round could be posted, including one already
      // played and scored, rewriting a tip whose result everyone had seen.
      if (round !== state.currentRound) {
        return res.status(403).json({
          success: false,
          message: `Tips can only be entered for ${
            state.roundName || `round ${state.currentRound}`
          }.`,
        });
      }

      const [fixtures, ladder, previousTip] = await Promise.all([
        db.Fixture.find({ year: season, round }),
        standingsService.getLadderMap(season, round),
        // The round before this one, which is what the consecutive-round rule
        // compares against. Round 0 is real, so the first round of a season
        // has no previous tip rather than a previous round of -1.
        round > 0
          ? db.Tip.findOne({ user: req.user.id, round: round - 1, season })
          : null,
      ]);

      const problem = validateSelections({
        topEightSelection: apiData.topEightSelection,
        bottomTenSelection: apiData.bottomTenSelection,
        fixtures,
        ladder,
        previousTip,
      });

      if (problem) {
        return res.status(400).json({ success: false, message: problem });
      }
    } catch (err) {
      console.error("tip validation failed:", err.message);
      return res
        .status(500)
        .json({ success: false, message: "Unable to check your tip." });
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
        // Creates the tip if this is the first submission for the round.
        upsert: true,
        // returnDocument: "after", not new: true. They mean the same thing -
        // hand back the document as it is once the update has been applied -
        // but `new` is deprecated in Mongoose 9 and warned about on every
        // start, which is noise that hides warnings worth reading.
        returnDocument: "after",
      };

    // A failure here has to be a failure status. It used to answer 200 with the
    // raw error as the body, and the tips page treats any 2xx as success - so
    // a save lost to a dropped connection or an Atlas failover sent the player
    // to the dashboard reading "Tips Submitted", on the one action in the app
    // with a deadline. Measured during the review: every write forced to fail
    // came back 200 {"name":"MongoNetworkError"}.
    //
    // The message is written for the player, not echoed from the error, which
    // can carry the query and the connection string.
    try {
      const data = await db.Tip.findOneAndUpdate(query, update, options);
      res.json(data);
    } catch (err) {
      console.error("tip save failed:", err.message);
      res.status(500).json({
        success: false,
        message: "Your tips weren't saved. Please try again.",
      });
    }
  });
  // POST /api/currentRound is gone. It worked out the live round by adding a
  // hand-set number of hours to now - `moment().add(3 + hoursToOffset)` - with
  // a note wondering whether the 3 should become a 2 when daylight saving
  // ended. That is a timezone correction maintained by hand. GET /api/season
  // answers the same question from fixture dates that are now stored as real
  // instants, so no offset is needed anywhere.

  // gets results from the previous round
  // Everybody's tips for one round.
  //
  // Private until the round bounces, and that was enforced by the dashboard
  // declining to draw the cells while this handed over every selection anyway -
  // the same shape the tipping deadline had before it moved here, and the same
  // worthless kind of rule. The page fetches this before the bounce, so the
  // tips were already sitting in every visitor's browser.
  //
  // The row is kept and emptied rather than dropped: who has entered is not the
  // secret, and the page reads the same object on either side of the bounce.
  app.post("/api/roundResult", requireAuth, async function (req, res) {
    try {
      const round = asRound(req.body.round);
      const season = await resolveSeason(req.body.season);
      const state = await seasonService.getSeasonState(season);

      // The username and nothing else. The populate used to bring back the
      // whole user - email, first and last name, the admin flag - for every
      // player in the round, to every signed-in account that asked, when the
      // page only ever draws the username. Masking the picks before lockout
      // was careful; handing out everybody's address alongside was not.
      const tips = await db.Tip.find({ round, season }).populate({
        path: "userDetail",
        select: "username",
      });

      if (selectionsVisible(state, round)) {
        return res.status(200).json(tips);
      }

      // toObject rather than the document, because the virtual carrying the
      // username is only on the object when the schema says so - which it does.
      res.status(200).json(
        tips.map((tip) => ({
          ...tip.toObject(),
          topEightSelection: null,
          bottomTenSelection: null,
          topEightCorrect: null,
          bottomTenCorrect: null,
          marginTopEight: null,
          marginBottomTen: null,
          topEightDifference: null,
          bottomTenDifference: null,
          correctTips: null,
          winnings: 0,
        }))
      );
    } catch (err) {
      console.error("round result failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to load this round." });
    }
  });

  // gets current round tips for user
  app.post("/api/userRoundTips", requireAuth, async function (req, res) {
    const apiData = req.body;
    // A 500 when the read fails, not a 200 carrying the error object. The page
    // read that object as the tip, found no selections on it, and showed the
    // player an empty form for a round they had already tipped.
    try {
      const data = await db.Tip.findOne({
        // Own tips only - tips are meant to be private until lockout.
        user: req.user.id,
        round: asRound(apiData.data && apiData.data.round),
        season: await resolveSeason(apiData.season),
      });
      res.status(200).json(data);
    } catch (err) {
      console.error("own tip lookup failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to load your tip." });
    }
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

  // POST /api/leaderboard is gone. It returned every tip of a season, the
  // round being tipped included, with no lockout check - so any signed-in
  // account could read the whole field's live picks before the first bounce,
  // and with them every player's email address and full name through the
  // unrestricted populate. Registration is open, so "signed in" meant anyone.
  //
  // Nothing called it. The leaderboard page reads the season tables from
  // /api/ladder and /api/leagues, which rank on the server and hold picks back
  // until a round locks; this was left over from before those existed, and
  // TipsAPI.getLeaderboard was its only caller and was not used either.
  //
  // routes/rounds.route.test.js checks it stays gone, and that the one route
  // here that still reads another player's tips is the one that masks them.

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
  app.post("/api/users", requireAuth, async function (req, res) {
    // Always the signed-in user: the id used to come from the body, so anyone
    // could read any account.
    //
    // A failure answers 500. It used to answer 200 with the raw error, which
    // the settings page took for the account and drew as blank details.
    try {
      const data = await db.User.findOne({ _id: req.user.id }).populate(
        "teamDetail"
      );
      res.json(data);
    } catch (err) {
      console.error("account details failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to load your details." });
    }
  });

  // Deletes the caller's own account - by removing everything that identifies
  // them, not by removing the record.
  //
  // This used to delete the user and every tip they had entered. Their tips
  // were also other people's history: the hourly re-score read the round
  // again without them, so a pool that had already been paid was paid again
  // differently - during the review a player's settled winnings changed from
  // 2 to 3 after somebody else deleted their account. And a league the
  // deleted user ran was left pointing at nobody, with nobody able to invite,
  // rename, remove a member or close it.
  //
  // So the account is anonymised. Name, email and username are overwritten,
  // the password is replaced with one nobody knows, and the record stays, so
  // their tips and results keep adding up and show as "Former player". Their
  // old address is free to sign up with again.
  app.delete("/api/deleteUser", requireAuth, async function (req, res) {
    // Only ever the caller's own account.
    const userId = req.user.id;

    try {
      // A league has exactly one admin, and the leave route already refuses
      // to let them walk away without handing it over. Deleting the account
      // was a way round that rule; it is not any more. Checked before anything
      // changes, and before the session ends - somebody told to hand a league
      // over first is still signed in to do it.
      const running = await db.League.find({ admin: userId, deletedAt: null })
        .select("_id name")
        .lean();

      const blocked = [];
      const alone = [];
      for (const league of running) {
        const others = await db.LeagueMembership.countDocuments({
          league: league._id,
          user: { $ne: userId },
        });
        (others ? blocked : alone).push(league);
      }

      if (blocked.length) {
        const names = blocked.map((l) => l.name).join(", ");
        return res.status(409).json({
          success: false,
          message:
            `You run ${names}. Hand ${blocked.length > 1 ? "them" : "it"} to ` +
            `another member in the league's settings first, then delete your ` +
            `account.`,
        });
      }

      // Nothing about who they were survives. The username keeps a fragment
      // of the id so two former players never collide, and carries a space,
      // which no real username can - so it can never be mistaken for, or
      // taken by, a real one. The address uses .invalid, which never resolves.
      const now = new Date();
      await db.User.updateOne(
        { _id: userId },
        {
          $set: {
            firstName: "Former",
            lastName: "player",
            username: `Former player ${String(userId).slice(-8)}`,
            email: `former-${userId}@deleted.invalid`,
            password: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
            admin: false,
            deletedAt: now,
          },
          $unset: { resetPassToken: "", tokenExpiration: "" },
        }
      );

      // A league they ran on their own has nobody to hand to; it closes, the
      // same soft delete the league's own delete route uses.
      if (alone.length) {
        await db.League.updateMany(
          { _id: { $in: alone.map((l) => l._id) } },
          { $set: { deletedAt: now } }
        );
      }

      // Out of every league, the way leaving is: the memberships go and the
      // results stay, because the rounds they played were played.
      await db.LeagueMembership.deleteMany({ user: userId });

      // Every device, not just this one.
      await endOtherSessions(userId);

      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res
          .status(200)
          .json({ success: true, message: "Account successfully deleted." });
      });
    } catch (err) {
      // Logged, like every other failure here. A deletion that fails is one
      // of the few things a user cannot retry their way out of - they are told
      // it did not work and have nothing else to go on - so the reason needs
      // to reach somewhere we can read it.
      console.error("deleteUser failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to delete account." });
    }
  });
};

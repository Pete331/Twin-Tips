const express = require("express");
const router = express.Router();
const db = require("../models");
const { requireAuth } = require("../middleware/auth");
const seasonService = require("../services/season");
const { seasonLadder } = require("../services/leagueStandings");
const { weeklyStandings } = require("../services/leagueRounds");

// Reads for a single league. Creating, joining and leaving come later; this is
// the standings surface, which is what proves the schemas and the migration
// were right before anything is built on top of them.

// A live league by slug, or null. Soft-deleted leagues are not found here -
// deleting one closes it to everything except its own members' history.
const findLeague = (slug) =>
  db.League.findOne({ slug: String(slug || ""), deletedAt: null });

// Membership gates reading, not the invite token. The token exists to let
// someone join; it must not double as a way to read a league you are not in,
// and neither must guessing a slug.
const requireMembership = async (req, res, next) => {
  try {
    const league = await findLeague(req.params.slug);

    if (!league) {
      return res
        .status(404)
        .json({ success: false, message: "No such league." });
    }

    const membership = await db.LeagueMembership.findOne({
      league: league._id,
      user: req.user.id,
    });

    // Deliberately the same 404 as a league that does not exist. A different
    // response would confirm the league is real to anyone trying slugs.
    if (!membership) {
      return res
        .status(404)
        .json({ success: false, message: "No such league." });
    }

    req.league = league;
    next();
  } catch (err) {
    console.error("league lookup failed:", err.message);
    res.status(500).json({ success: false, message: "Unable to load league." });
  }
};

// @route  GET /api/leagues/mine
// @desc   The leagues the signed-in user belongs to
// @access Private
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const memberships = await db.LeagueMembership.find({ user: req.user.id })
      .populate({
        path: "league",
        select: "name slug type buyIn admin deletedAt",
      })
      .sort({ joinedAt: 1 });

    const leagues = memberships
      .map((m) => m.league)
      .filter((league) => league && !league.deletedAt)
      .map((league) => ({
        name: league.name,
        slug: league.slug,
        type: league.type,
        buyIn: league.buyIn,
        isAdmin: String(league.admin) === String(req.user.id),
      }));

    res.status(200).json({ leagues });
  } catch (err) {
    console.error("leagues/mine failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to load your leagues." });
  }
});

// @route  GET /api/leagues/:slug
// @desc   One league's detail
// @access Private, members only
router.get("/:slug", requireAuth, requireMembership, async (req, res) => {
  const league = req.league;
  const memberCount = await db.LeagueMembership.countDocuments({
    league: league._id,
  });

  res.status(200).json({
    name: league.name,
    slug: league.slug,
    type: league.type,
    buyIn: league.buyIn,
    createdSeason: league.createdSeason,
    startRound: league.startRound,
    memberCount,
    isAdmin: String(league.admin) === String(req.user.id),
    // Only the admin needs the credential, and only they can act on it.
    invite:
      String(league.admin) === String(req.user.id)
        ? { token: league.inviteToken, code: league.joinCode }
        : undefined,
  });
});

// @route  GET /api/leagues/:slug/standings
// @desc   The league's table for a season
// @access Private, members only
router.get(
  "/:slug/standings",
  requireAuth,
  requireMembership,
  async (req, res) => {
    try {
      const league = req.league;

      // Defaults to the season the app is in, so the client does not have to
      // know which year it is.
      const requested = Number(req.query.season);
      const season = Number.isInteger(requested)
        ? requested
        : (await seasonService.getSeasonState()).season;

      // Two different tables, and deliberately not one component with a flag:
      // a season ladder ranks on tips and margin, a weekly league on what
      // people have won. They share the ranking rule underneath and nothing
      // above it.
      const ladder =
        league.type === "weekly"
          ? await weeklyStandings(league, season)
          : await seasonLadder(league, season);

      res.status(200).json({
        league: { name: league.name, slug: league.slug, type: league.type },
        // The buy-in travels with the standings. Two leagues on one page can
        // charge different amounts, so the multiplier cannot live in the
        // client the way it used to.
        buyIn: league.buyIn,
        ...ladder,
      });
    } catch (err) {
      console.error("league standings failed:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Unable to load standings." });
    }
  }
);

module.exports = router;

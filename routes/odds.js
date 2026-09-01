// Prices for a round, read from what the cron stored.
//
// The browser never talks to The Odds API. The key lives on the cron service
// alone (see render.yaml), the hourly job writes the prices down, and this
// hands over what it wrote. A page load costs nothing and cannot exhaust the
// month's credits however many people open it.

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const db = require("../models");
const seasonService = require("../services/season");

// What the card shows, and nothing else.
//
// The stored row also holds every individual bookmaker quote - eleven per side,
// kept so the exclusion arithmetic stays revisable. That is for us, not for the
// browser: it is roughly twenty times the payload of the summary and no page
// renders any of it.
const DISPLAY_FIELDS =
  "game year round homeTeamId awayTeamId fetchedAt " +
  "home.best home.average home.bookmaker home.count home.low home.high " +
  "away.best away.average away.bookmaker away.count away.low away.high";

// @route  GET /api/odds/:round
// @desc   Bookmaker prices for every priced game in a round
// @access Private
//
// Signed in only, matching every other data route here. Nothing about these
// prices is secret - they are on the bookmakers' own front pages - but there is
// no reason for this to be the one endpoint that answers to anyone.
router.get("/:round", requireAuth, async (req, res) => {
  // Round 0 is a real round in this competition, so parse and check the type
  // rather than testing for truthiness.
  const round = Number(req.params.round);
  if (!Number.isInteger(round) || round < 0) {
    return res
      .status(400)
      .json({ success: false, message: "round must be a number." });
  }

  try {
    const requested = Number(req.query.season);
    const year = Number.isInteger(requested)
      ? requested
      : (await seasonService.getSeasonState()).season;

    const rows = await db.Odds.find({ year, round })
      .select(DISPLAY_FIELDS)
      .lean();

    // Keyed by game id, because that is how the card looks them up. The
    // predictions alongside them arrive as an array and get scanned for a
    // matching id on every render of every card; there is no reason to repeat
    // that shape now it is being chosen.
    const games = {};
    for (const row of rows) {
      games[row.game] = {
        home: row.home,
        away: row.away,
        // The card says how old a price is, so a stale one reads as stale
        // rather than as current.
        fetchedAt: row.fetchedAt,
      };
    }

    res.status(200).json({ year, round, games });
  } catch (err) {
    console.error("odds lookup failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to load the odds." });
  }
});

module.exports = router;

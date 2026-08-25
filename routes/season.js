const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const season = require("../services/season");
const seasonSync = require("../services/seasonSync");

// Single source of truth for which season and round the app is in, replacing
// the season constants that were hardcoded - and disagreeing - across the
// client.
router.get("/", requireAuth, async (req, res) => {
  try {
    const state = await season.getSeasonState(req.query.season);
    res.status(200).json(state);
  } catch (err) {
    console.error("Failed to resolve season state:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to determine the season." });
  }
});

// Which seasons have fixtures, newest first.
router.get("/available", requireAuth, async (req, res) => {
  try {
    res.status(200).json({ seasons: await season.getAvailableSeasons() });
  } catch (err) {
    console.error("Failed to list seasons:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to list seasons." });
  }
});

// What the last sync actually achieved, so an admin can tell the scheduled job
// is doing its work without reading server logs.
router.get("/status", requireAdmin, async (req, res) => {
  try {
    const db = require("../models");
    const standings = require("../services/standings");

    const year = Number(req.query.season) || (await season.getSeasonState()).season;

    const [newestFixture, newestLadder] = await Promise.all([
      db.Fixture.findOne({ year }).sort({ updatedAt: -1 }).select("updatedAt"),
      db.Standing.findOne({ year }).sort({ updatedAt: -1 }).select("updatedAt"),
    ]);

    const ladderRounds = await standings.getStoredRounds(year);
    const scoredRounds = await db.Tip.distinct("round", {
      season: year,
      correctTips: { $ne: null },
    });

    res.status(200).json({
      season: year,
      // Null until the next sync: timestamps were added to fixtures after
      // these documents were written.
      fixturesUpdated: newestFixture ? newestFixture.updatedAt : null,
      laddersUpdated: newestLadder ? newestLadder.updatedAt : null,
      ladderRounds,
      scoredRounds: scoredRounds.sort((a, b) => a - b),
    });
  } catch (err) {
    console.error("season status failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to read sync status." });
  }
});

// Pulls a season from Squiggle into the database. Admin-only: it is the one
// route that rewrites shared fixture, ladder and team data.
router.post("/sync", requireAdmin, async (req, res) => {
  const year = Number(req.body.year);

  if (!Number.isInteger(year)) {
    return res
      .status(400)
      .json({ success: false, message: "year must be a number." });
  }

  try {
    const result = await seasonSync.syncSeason(year);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Season sync failed:", err.message);
    res
      .status(502)
      .json({ success: false, message: `Sync failed: ${err.message}` });
  }
});

module.exports = router;

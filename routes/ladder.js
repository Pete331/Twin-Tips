const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const globalLadder = require("./../services/globalLadder");
const seasonService = require("./../services/season");
const { selectionsVisible } = require("./../services/tipRules");

// @route  GET /api/ladder/global/rounds/:round
// @desc   One round, over everybody
// @access Private
//
// The site ladder's version of GET /api/leagues/:slug/rounds/:round, and the
// same shape, so the leaderboard renders both with one table.
//
// Declared above /global rather than below it only for reading order - Express
// matches these two exactly and neither can swallow the other.
router.get("/global/rounds/:round", requireAuth, async (req, res) => {
  try {
    // Round 0 is a real round in this competition and is falsy, so this checks
    // the type rather than the truthiness.
    const round = Number(req.params.round);
    if (!Number.isInteger(round) || round < 0) {
      return res
        .status(400)
        .json({ success: false, message: "Round must be a number." });
    }

    const requested = Number(req.query.season);
    const state = await seasonService.getSeasonState(
      Number.isInteger(requested) ? requested : undefined
    );
    const season = Number.isInteger(requested) ? requested : state.season;

    // Nobody's picks before the bounce, decided here rather than by the page
    // declining to draw them. The two eligible teams make a leak worse than it
    // would be in an ordinary tipping competition: there are few enough legal
    // tips that seeing a handful of people's is close to seeing everybody's.
    const detail = await globalLadder.roundDetail(season, round, {
      showSelections: selectionsVisible(state, round),
    });

    res.status(200).json(detail);
  } catch (err) {
    console.error("global round failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to load this round." });
  }
});

// @route  GET /api/ladder/global
// @desc   Every user, ranked on the season ladder rules
// @access Private
//
// Signed in only. It lists every member of the app by name, which is not
// something to hand to anyone who finds the URL.
router.get("/global", requireAuth, async (req, res) => {
  try {
    const requested = Number(req.query.season);
    const ladder = await globalLadder.get(
      Number.isInteger(requested) ? requested : undefined
    );

    res.status(200).json(ladder);
  } catch (err) {
    console.error("global ladder failed:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Unable to load the ladder." });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const globalLadder = require("./../services/globalLadder");

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

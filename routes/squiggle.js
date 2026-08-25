// Browser-facing proxy for the Squiggle API.
//
// Squiggle's terms forbid "a website that makes visitors fetch directly from the
// Squiggle API themselves", and they enforce it: requests carrying an Origin
// header from an origin they haven't allowlisted get a 403, and a browser cannot
// set the identifying User-Agent they require. So every Squiggle call has to
// originate on the server. The shared client lives in services/squiggle.js.

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const squiggle = require("../services/squiggle");

// Only these query types may be proxied - the route must not become an open
// relay that forwards arbitrary URLs.
const ALLOWED_QUERIES = ["games", "teams", "standings", "tips"];

// Only these parameters are forwarded, and each must be a plain integer.
const ALLOWED_PARAMS = ["year", "round", "source"];

router.get("/:query", requireAuth, async (req, res) => {
  const { query } = req.params;

  if (!ALLOWED_QUERIES.includes(query)) {
    return res
      .status(400)
      .json({ success: false, message: `Unsupported query type: ${query}` });
  }

  const params = {};
  for (const key of ALLOWED_PARAMS) {
    const value = req.query[key];
    if (value === undefined) continue;
    if (!/^\d+$/.test(String(value))) {
      return res
        .status(400)
        .json({ success: false, message: `${key} must be a number.` });
    }
    params[key] = String(value);
  }

  try {
    const data = await squiggle.query(query, params);
    res.status(200).json(data);
  } catch (err) {
    console.error("Squiggle proxy failed:", err.message);
    res
      .status(502)
      .json({ success: false, message: "Unable to reach the Squiggle API." });
  }
});

module.exports = router;

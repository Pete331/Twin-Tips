// Server-side proxy for the Squiggle API.
//
// Squiggle's terms forbid "a website that makes visitors fetch directly from the
// Squiggle API themselves", and they enforce it: requests carrying an Origin
// header from an origin they haven't allowlisted get a 403, and a browser cannot
// set the identifying User-Agent they require. So every Squiggle call has to
// originate here.
//
// They also ask callers to "cache and re-use data appropriately", hence the
// in-memory cache below.

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

const SQUIGGLE_BASE = "https://api.squiggle.com.au/";

// Squiggle require a UserAgent identifying the app and carrying a contact
// address, e.g. "Dan's Tipping Comp - dan@example.com". Kept in the environment
// rather than in source: this repo is public, and a hardcoded address would be
// published to anyone scraping GitHub for email addresses.
const CONTACT = process.env.SQUIGGLE_CONTACT;
const USER_AGENT = CONTACT ? `Twin Tips - ${CONTACT}` : "Twin Tips";

if (!CONTACT) {
  console.warn(
    "SQUIGGLE_CONTACT is not set - Squiggle asks for a contact address in the " +
      "UserAgent and may refuse or ban requests without one."
  );
}

// Only these query types may be proxied - the route must not become an open
// relay that forwards arbitrary URLs.
const ALLOWED_QUERIES = ["games", "teams", "standings", "tips"];

// Only these parameters are forwarded, and each must be a plain integer.
const ALLOWED_PARAMS = ["year", "round", "source"];

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const buildUrl = (query, params) => {
  // Squiggle separates parameters with semicolons: ?q=games;year=2023;round=5
  const parts = [`q=${query}`];
  for (const key of ALLOWED_PARAMS) {
    if (params[key] !== undefined) parts.push(`${key}=${params[key]}`);
  }
  return `${SQUIGGLE_BASE}?${parts.join(";")}`;
};

const fetchSquiggle = async (url) => {
  const cached = cache.get(url);
  if (cached && Date.now() < cached.expires) {
    return cached.promise;
  }

  const promise = (async () => {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Squiggle responded ${response.status}`);
    }

    const body = await response.json();

    // A 200 can still carry an error, e.g. {"error":"bad_UA"} when the
    // UserAgent is rejected. Treat that as a failure rather than caching it.
    const payload = Array.isArray(body[Object.keys(body)[0]])
      ? body[Object.keys(body)[0]]
      : null;
    if (payload && payload.length === 1 && payload[0] && payload[0].error) {
      throw new Error(`Squiggle rejected the request: ${payload[0].error}`);
    }

    return body;
  })();

  // Cached before it settles so parallel callers share one upstream request.
  cache.set(url, { promise, expires: Date.now() + CACHE_TTL_MS });

  try {
    return await promise;
  } catch (err) {
    // Never leave a rejection cached, or the failure sticks for the whole TTL.
    cache.delete(url);
    throw err;
  }
};

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
    const data = await fetchSquiggle(buildUrl(query, params));
    res.status(200).json(data);
  } catch (err) {
    console.error("Squiggle proxy failed:", err.message);
    res
      .status(502)
      .json({ success: false, message: "Unable to reach the Squiggle API." });
  }
});

module.exports = router;

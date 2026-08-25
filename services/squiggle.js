// Shared client for the Squiggle API.
//
// Every Squiggle call in the app goes through here: their terms forbid visitors
// fetching directly, and they require a UserAgent identifying the app with a
// contact address. See routes/squiggle.js (browser proxy) and
// services/seasonSync.js (server-side data load).

const SQUIGGLE_BASE = "https://api.squiggle.com.au/";

// e.g. "Dan's Tipping Comp - dan@example.com". Kept in the environment rather
// than in source because this repository is public.
const CONTACT = process.env.SQUIGGLE_CONTACT;
const USER_AGENT = CONTACT ? `Twin Tips - ${CONTACT}` : "Twin Tips";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

// Squiggle separates parameters with semicolons: ?q=games;year=2026;round=5
const buildUrl = (query, params = {}) => {
  const parts = [`q=${query}`];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) parts.push(`${key}=${value}`);
  }
  return `${SQUIGGLE_BASE}?${parts.join(";")}`;
};

const fetchUrl = async (url) => {
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

    // A 200 can still carry an error, e.g. {"error":"bad_UA"}. Don't cache it.
    const first = body[Object.keys(body)[0]];
    if (Array.isArray(first) && first.length === 1 && first[0] && first[0].error) {
      throw new Error(`Squiggle rejected the request: ${first[0].error}`);
    }

    return body;
  })();

  // Stored before it settles so concurrent callers share one upstream request.
  cache.set(url, { promise, expires: Date.now() + CACHE_TTL_MS });

  try {
    return await promise;
  } catch (err) {
    // Never leave a rejection cached, or the failure sticks for the whole TTL.
    cache.delete(url);
    throw err;
  }
};

const query = (type, params) => fetchUrl(buildUrl(type, params));

module.exports = {
  query,
  buildUrl,
  fetchUrl,
  hasContact: () => Boolean(CONTACT),
};

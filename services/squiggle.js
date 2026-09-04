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

// How long to wait before giving up on Squiggle.
//
// Node's fetch has no overall request timeout. Left alone it falls back to
// undici's 300 second header timeout, which is not so much a timeout as an
// afternoon - and one of these calls is awaited inside POST /api/detailsRound,
// the tips page's own fixture load. A slow Squiggle held that request open
// during a live round, which is exactly when Squiggle is busiest and when the
// most people are looking at the page.
//
// Fifteen seconds suits a season sync, which legitimately asks for a whole
// year of games at once. Anything on a request path passes something shorter.
const DEFAULT_TIMEOUT_MS = 15000;

// Squiggle separates parameters with semicolons: ?q=games;year=2026;round=5
const buildUrl = (query, params = {}) => {
  const parts = [`q=${query}`];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) parts.push(`${key}=${value}`);
  }
  return `${SQUIGGLE_BASE}?${parts.join(";")}`;
};

const fetchUrl = async (url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const cached = cache.get(url);
  if (cached && Date.now() < cached.expires) {
    return cached.promise;
  }

  const promise = (async () => {
    let response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Say which failure this was. "The operation was aborted" on its own
      // sends whoever reads the log looking for a bug in the caller.
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new Error(`Squiggle did not respond within ${timeoutMs}ms`, {
          cause: err,
        });
      }
      throw err;
    }

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

const query = (type, params, options) => fetchUrl(buildUrl(type, params), options);

module.exports = {
  query,
  buildUrl,
  fetchUrl,
  hasContact: () => Boolean(CONTACT),
};

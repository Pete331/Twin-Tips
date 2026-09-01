// Client for The Odds API.
//
// The same arrangement as services/squiggle.js: one module owns the calls, the
// key never leaves the server, and nothing in the browser talks to the provider
// directly. Switching providers should be this file and no other.
//
// The quota is the thing that makes this different from an ordinary client.
// Every response carries how many credits are left, and that number decides
// whether the next call happens at all - so it is read on every request and
// handed back to the caller rather than logged and forgotten.

const BASE = "https://api.the-odds-api.com/v4";

// Server-side only. A key with a VITE_ prefix would be compiled into the client
// bundle and public, so the name matters as much as the value.
const API_KEY = process.env.ODDS_API_KEY;

// AFL's key in the provider's sport list. Confirmed against /sports rather than
// taken from documentation - scripts/probeOdds.js prints what is actually
// there, and this is the value it found.
const SPORT = process.env.ODDS_SPORT || "aussierules_afl";

// Australian books only. Regions multiply the credit cost, so a second one
// doubles the monthly spend for prices nobody here would use.
const REGIONS = "au";

// Head to head. Markets multiply the cost the same way, and a tipping site has
// no use for spreads or totals.
const MARKETS = "h2h";

// Long enough for a slow response, short enough that a scheduled job does not
// sit on a socket. The mail work earlier this year is the cautionary tale: a
// two-minute default on a blocked port held a request open for two minutes.
const TIMEOUT_MS = 15000;

const isConfigured = () => Boolean(API_KEY);

// The three headers worth having. remaining decides whether to call again, used
// tracks the month, and last is what this specific call cost - which is how a
// request that quietly asked for more markets than intended gets noticed.
const quotaFrom = (response) => ({
  remaining: response.headers.get("x-requests-remaining"),
  used: response.headers.get("x-requests-used"),
  last: response.headers.get("x-requests-last"),
});

const request = async (path, params = {}) => {
  if (!isConfigured()) {
    throw new Error("ODDS_API_KEY is not set");
  }

  const query = new URLSearchParams({ apiKey: API_KEY, ...params });
  const url = `${BASE}${path}?${query}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const quota = quotaFrom(response);

  if (!response.ok) {
    // The body names the fault - an exhausted quota, a revoked key, a sport
    // that does not exist. Worth surfacing rather than the status alone.
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `Odds API ${response.status}: ${detail.slice(0, 200) || response.statusText}`
    );
    error.status = response.status;
    error.quota = quota;
    throw error;
  }

  return { data: await response.json(), quota };
};

// Free. Lists every sport the provider covers, which is how the AFL key gets
// confirmed rather than assumed.
const sports = () => request("/sports", { all: "true" });

// Free, and the reason the off-season costs nothing: upcoming fixtures without
// prices. A round with no events can be detected before spending anything.
const events = () => request(`/sports/${SPORT}/events`);

// The one call that costs a credit. One market, one region: one credit.
//
// Bookmakers are free - the cost is markets times regions and nothing else - so
// this returns every Australian book that priced the game for the same price as
// returning one.
const odds = (options = {}) =>
  request(`/sports/${SPORT}/odds`, {
    regions: options.regions || REGIONS,
    markets: options.markets || MARKETS,
    oddsFormat: "decimal",
    dateFormat: "iso",
  });

module.exports = {
  isConfigured,
  sports,
  events,
  odds,
  request,
  quotaFrom,
  SPORT,
  REGIONS,
  MARKETS,
  TIMEOUT_MS,
};

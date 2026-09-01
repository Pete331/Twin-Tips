// Looks at what The Odds API actually returns, before anything is built on it.
//
//   node scripts/probeOdds.js          free endpoints only, costs nothing
//   node scripts/probeOdds.js --odds   one odds call, costs one credit
//
// Phase one assumed things: that AFL is "aussierules_afl", that the feed sends
// full club names like "Adelaide Crows", that Australian books appear under the
// keys the marketing page lists. Every one of those is a guess until a real
// response is read, and a wrong guess about club names does not raise an error
// - it silently drops fixtures.
//
// The two listing calls are free and the odds call is one credit, so the whole
// probe costs a credit at most. It writes nothing to the database.
require("dotenv").config();
const fs = require("fs");

const oddsApi = require("../services/oddsApi");
const { teamIdFor } = require("../services/oddsTeams");
const { summariseEvent, isExcluded } = require("../services/oddsMarket");

const WITH_ODDS = process.argv.includes("--odds");

const line = (label, value) => console.log(`  ${String(label).padEnd(26)} ${value}`);
const head = (text) => console.log(`\n=== ${text} ${"=".repeat(Math.max(0, 54 - text.length))}`);

const showQuota = (quota) => {
  line("credits remaining", quota.remaining ?? "(header absent)");
  line("credits used this month", quota.used ?? "(header absent)");
  line("this call cost", quota.last ?? "(header absent)");
};

(async () => {
  if (!oddsApi.isConfigured()) {
    console.error(
      "  ODDS_API_KEY is not set. Add it to .env - the key is server-side only,\n" +
        "  so it must not be named with a VITE_ prefix."
    );
    process.exit(1);
  }

  // ---------------------------------------------------------------- free
  head("Is AFL there, and under what key?");
  const { data: allSports, quota: sportsQuota } = await oddsApi.sports();

  const afl = allSports.filter((s) =>
    /afl|aussie/i.test(`${s.key} ${s.title} ${s.description || ""}`)
  );

  if (!afl.length) {
    console.log("  nothing matching AFL in the sport list");
  }
  for (const sport of afl) {
    line(sport.key, `${sport.title} - active: ${sport.active}`);
  }

  const expected = afl.some((s) => s.key === oddsApi.SPORT);
  line("we assumed", oddsApi.SPORT);
  line("that key exists", expected ? "yes" : "NO - update ODDS_SPORT");
  showQuota(sportsQuota);

  // ---------------------------------------------------------------- free
  head("Upcoming fixtures (free, and how the off-season costs nothing)");
  const { data: events, quota: eventsQuota } = await oddsApi.events();
  line("events returned", events.length);

  for (const event of events.slice(0, 5)) {
    line(new Date(event.commence_time).toISOString().slice(0, 16), `${event.home_team} v ${event.away_team}`);
  }
  showQuota(eventsQuota);

  // ------------------------------------------------------- club names
  head("Do the club names resolve against our table?");
  const names = new Set();
  for (const event of events) {
    names.add(event.home_team);
    names.add(event.away_team);
  }

  const unresolved = [];
  for (const name of [...names].sort()) {
    const id = teamIdFor(name);
    line(name, id === null ? "UNRESOLVED" : `-> ${id}`);
    if (id === null) unresolved.push(name);
  }

  console.log(
    unresolved.length
      ? `\n  ${unresolved.length} name(s) need adding to services/oddsTeams.js: ${unresolved.join(", ")}`
      : `\n  all ${names.size} club names resolve`
  );

  if (!WITH_ODDS) {
    console.log("\n  Stopping here. Pass --odds to spend one credit and see real prices.");
    return;
  }

  // ------------------------------------------------------ one credit
  head("Prices (one credit)");
  const { data: priced, quota: oddsQuota } = await oddsApi.odds();
  line("events with prices", priced.length);
  showQuota(oddsQuota);

  // Saved so the same response can be picked over as many times as needed
  // without spending again. Questions like mean-versus-median want the whole
  // distribution, not the summary printed below, and finding that out should
  // not cost a credit each time.
  const dump = `odds-sample-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(dump, JSON.stringify(priced, null, 1));
  line("raw response saved", dump);

  const books = new Map();
  for (const event of priced) {
    for (const bookmaker of event.bookmakers || []) {
      books.set(bookmaker.key, bookmaker.title);
    }
  }

  head(`Bookmakers present (${books.size})`);
  for (const [key, title] of [...books.entries()].sort()) {
    line(key, `${title}${isExcluded(key) ? "   [excluded from both figures]" : ""}`);
  }

  head("What the market arithmetic makes of the first game");
  const first = priced[0];
  if (!first) {
    console.log("  no priced events - nothing on between now and the next round");
    return;
  }

  line("fixture", `${first.home_team} v ${first.away_team}`);
  line("starts", first.commence_time);

  const summary = summariseEvent(first);
  for (const side of ["home", "away"]) {
    const s = summary[side];
    const team = side === "home" ? first.home_team : first.away_team;
    console.log(`\n  ${team}`);
    line("  average", s.average === null ? "-" : `$${s.average.toFixed(2)}`);
    line("  best", s.best === null ? "-" : `$${s.best.toFixed(2)} (${s.bookmaker})`);
    line("  books counted", s.count);
    line("  spread", s.low === null ? "-" : `$${s.low.toFixed(2)} to $${s.high.toFixed(2)}`);
  }

  // The mean-versus-median question, answered from real spreads rather than
  // theory. A single stale book sitting well outside the pack is what would
  // decide it.
  head("Spread across every priced game, for the mean/median question");
  for (const event of priced.slice(0, 10)) {
    const s = summariseEvent(event);
    if (s.empty) continue;
    const gap = s.home.high === null ? 0 : s.home.high - s.home.low;
    line(
      `${event.home_team} v ${event.away_team}`.slice(0, 40),
      `home $${s.home.low?.toFixed(2)}-$${s.home.high?.toFixed(2)} (spread $${gap.toFixed(2)}, ${s.home.count} books)`
    );
  }
})().catch((err) => {
  console.error(`\n  probe failed: ${err.message}`);
  if (err.quota) showQuota(err.quota);
  process.exit(1);
});

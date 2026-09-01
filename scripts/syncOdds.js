// Fetches AFL prices and files them against fixtures.
//
//   node scripts/syncOdds.js            report what it would write
//   node scripts/syncOdds.js --apply    write it
//   node scripts/syncOdds.js 2026       a particular season
//
// Report-only by default, the same shape as scripts/migrateToLeagues.js. The
// fetch happens either way - a plan cannot be made without prices, and it is
// the one credit this costs regardless.
//
// Every event is accounted for rather than only the ones that worked. A game
// that fails to match a fixture does not raise anything; it simply never gets
// a price, and a report that lists only successes is how that goes unnoticed
// for a season.
const mongoose = require("mongoose");
require("dotenv").config();

const { syncOdds } = require("../services/oddsSync");
const oddsApi = require("../services/oddsApi");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const APPLY = process.argv.includes("--apply");

const yearArg = process.argv.slice(2).find((a) => /^\d{4}$/.test(a));
const SEASON = yearArg ? Number(yearArg) : undefined;

const line = (label, value) => console.log(`  ${String(label).padEnd(22)} ${value}`);

(async () => {
  if (!oddsApi.isConfigured()) {
    console.error("  ODDS_API_KEY is not set - nothing to fetch.");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  const result = await syncOdds({ apply: APPLY, season: SEASON });

  console.log(APPLY ? "\n  writing\n" : "\n  report only - pass --apply to write\n");

  line("season", result.year);
  line("events fetched", result.events);
  line("credits remaining", result.quota.remaining ?? "(header absent)");
  line("this call cost", result.quota.last ?? "(header absent)");

  console.log();
  line("ready", result.ready.length);
  line("no fixture", result.unmatched.length);
  line("unknown club name", result.unresolved.length);
  line("nobody has priced", result.unpriced.length);

  if (result.ready.length) {
    console.log("\n  prices found:");
    for (const entry of result.ready) {
      const { fixture, sides } = entry;
      const home = sides.home.best === null ? "-" : `$${sides.home.best.toFixed(2)}`;
      const away = sides.away.best === null ? "-" : `$${sides.away.best.toFixed(2)}`;
      console.log(
        `    r${String(fixture.round).padStart(2)} ${`${fixture.hteam} v ${fixture.ateam}`.padEnd(38)} ` +
          `${home.padStart(6)} / ${away.padStart(6)}  (${sides.home.count} books)`
      );
    }
  }

  // Named loudly. An unresolved club name is a one-line fix in
  // services/oddsTeams.js, and the cost of missing it is that club's games
  // never showing a price.
  for (const [label, rows] of [
    ["unknown club names - add them to services/oddsTeams.js", result.unresolved],
    ["no fixture matched", result.unmatched],
    ["matched but unpriced", result.unpriced],
  ]) {
    if (!rows.length) continue;
    console.log(`\n  ${label}:`);
    for (const row of rows) console.log(`    ${row.detail}`);
  }

  console.log(
    APPLY
      ? `\n  wrote ${result.written} row(s)`
      : `\n  nothing written - ${result.ready.length} row(s) would be`
  );

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(`\n  sync failed: ${err.message}`);
  if (err.quota) console.error(`  credits remaining: ${err.quota.remaining}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

// Loads a season from Squiggle into MongoDB from the command line:
//
//   node scripts/syncSeason.js 2026    a particular season
//   node scripts/syncSeason.js         whichever season is current
//
// Handy for seeding a fresh database, and the obvious thing to point a
// scheduled job at so the data stays current without anyone opening the app.
//
// With no argument the season is resolved rather than assumed - see
// resolveSyncYear. Name a year explicitly and that is what you get, including
// the error if Squiggle has nothing for it.

const mongoose = require("mongoose");
require("dotenv").config();

const seasonSync = require("../services/seasonSync");
const oddsSync = require("../services/oddsSync");
const squiggle = require("../services/squiggle");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";

(async () => {
  const requested = Number(process.argv[2]);
  const named = Number.isInteger(requested);

  if (!squiggle.hasContact()) {
    console.warn(
      "SQUIGGLE_CONTACT is not set - Squiggle asks for a contact address in " +
        "the UserAgent and may refuse or ban requests without one."
    );
  }

  await mongoose.connect(MONGODB_URI);

  let year = requested;
  if (!named) {
    const resolved = await seasonSync.resolveSyncYear();
    year = resolved.year;
    if (resolved.fellBack) {
      console.log(
        `Squiggle has no fixture for ${new Date().getFullYear()} yet - ` +
          `syncing ${year} instead.`
      );
    }
  }

  console.log(`Syncing ${year} from Squiggle...`);

  try {
    const result = await seasonSync.syncSeason(year);
    console.log(
      `Done: ${result.games} games, ${result.teams} teams for ${result.year}.`
    );
    console.log(
      `Ladders: ${result.ladders.completed} completed round(s), ` +
        `${result.ladders.captured} new snapshot(s)` +
        (result.ladders.rounds.length
          ? ` for round(s) ${result.ladders.rounds.join(", ")}.`
          : ".")
    );
    console.log(
      `Scored: ${result.scored.scored} tip(s) across ` +
        `${result.scored.rounds} completed round(s).`
    );
    console.log(`Global ladder: ${result.globalLadder} player(s) ranked.`);
    console.log(
      `Weekly leagues: ${result.weekly.rounds} round(s) settled across ` +
        `${result.weekly.leagues} league(s).`
    );
    if (result.missingLogos && result.missingLogos.length) {
      console.warn(`No logo file for: ${result.missingLogos.join(", ")}`);
    }
  } catch (err) {
    console.error("Sync failed:", err.message);
    process.exitCode = 1;
  }

  // Odds, in its own try/catch and deliberately after the season.
  //
  // These are two jobs sharing one schedule, not one job in two halves. Scores,
  // ladders and settled tips are what the app is; prices sit beside them. A
  // provider outage, an expired key or an exhausted quota must not cost anyone
  // their round results, so nothing thrown here escapes.
  //
  // It also does not set exitCode. A failed odds poll would paint the whole run
  // red in Render, and a run that goes red for a decorative feature is one
  // nobody looks at by the third week - which is exactly when a genuine season
  // sync failure needs to be noticed. The warning is in the log; the run stays
  // honest about the job it exists to do.
  try {
    const poll = await oddsSync.pollOdds({ apply: true });

    if (!poll.polled) {
      console.log(`Odds: skipped - ${poll.reason}.`);
    } else {
      const odds = poll.result;
      console.log(
        `Odds: ${odds.written} game(s) priced from ${odds.events} event(s), ` +
          `${odds.quota.remaining ?? "?"} credits left.`
      );

      // Named, because an unresolved club name is a one-line fix in
      // services/oddsTeams.js and the cost of it going unnoticed is that club
      // never showing a price all season.
      for (const row of odds.unresolved) console.warn(`Odds: ${row.detail}`);
      for (const row of odds.unmatched) console.warn(`Odds: ${row.detail}`);
    }
  } catch (err) {
    console.warn(`Odds: failed, season sync unaffected - ${err.message}`);
  }

  await mongoose.disconnect();
})();

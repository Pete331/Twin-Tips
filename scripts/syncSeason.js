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
  } finally {
    await mongoose.disconnect();
  }
})();

// Loads a season from Squiggle into MongoDB from the command line:
//
//   node scripts/syncSeason.js 2026
//
// Handy for seeding a fresh database, and the obvious thing to point a
// scheduled job at so the data stays current without anyone opening the app.

const mongoose = require("mongoose");
require("dotenv").config();

const seasonSync = require("../services/seasonSync");
const squiggle = require("../services/squiggle");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";

(async () => {
  const year = Number(process.argv[2]) || new Date().getFullYear();

  if (!squiggle.hasContact()) {
    console.warn(
      "SQUIGGLE_CONTACT is not set - Squiggle asks for a contact address in " +
        "the UserAgent and may refuse or ban requests without one."
    );
  }

  await mongoose.connect(MONGODB_URI);
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

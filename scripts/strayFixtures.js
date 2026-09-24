// Lists fixtures stored for a season that Squiggle no longer serves:
//
//   node scripts/strayFixtures.js 2026    a particular season
//   node scripts/strayFixtures.js         whichever season is current
//
// Read-only. It opens the database, compares what is stored against what
// Squiggle answers with, prints the difference, and disconnects. Nothing is
// written or deleted, so it is safe to point at production.
//
// syncSeason prunes these automatically now, within the limits in
// services/seasonSync.js. This exists for the two cases that leaves: checking
// a database that has not been synced since, and looking at what the prune
// refused to touch because the payload came back too short.

const mongoose = require("mongoose");
require("dotenv").config({ quiet: true });

const db = require("../models");
const squiggle = require("../services/squiggle");
const seasonSync = require("../services/seasonSync");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";

(async () => {
  const requested = Number(process.argv[2]);

  if (!squiggle.hasContact()) {
    console.warn(
      "SQUIGGLE_CONTACT is not set - Squiggle asks for a contact address in " +
        "the UserAgent and may refuse or ban requests without one."
    );
  }

  await mongoose.connect(MONGODB_URI);

  try {
    // Resolved rather than assumed for the same reason syncSeason does it: in
    // January the new season exists as a number long before Squiggle has a draw.
    const year = Number.isInteger(requested)
      ? requested
      : (await seasonSync.resolveSyncYear()).year;

    const { games } = await squiggle.query("games", { year });
    if (!Array.isArray(games) || !games.length) {
      console.error(`Squiggle returned no games for ${year}. Nothing to compare.`);
      process.exitCode = 1;
      return;
    }

    const live = new Set(games.map((game) => game.id));
    const stored = await db.Fixture.find({ year })
      .select("id round roundname hteam ateam complete date updatedAt")
      .sort({ round: 1, date: 1 })
      .lean();

    console.log(`Season ${year}: Squiggle serves ${games.length}, stored ${stored.length}.`);

    const strays = stored.filter((fixture) => !live.has(fixture.id));

    if (!strays.length) {
      console.log("Nothing stored that Squiggle no longer serves.");
      return;
    }

    console.log(`\n${strays.length} fixture(s) Squiggle no longer serves:\n`);
    strays.forEach((fixture) => {
      console.log(
        `  id ${fixture.id}  ${fixture.roundname || `round ${fixture.round}`}  ` +
          `${fixture.hteam || "TBC"} v ${fixture.ateam || "TBC"}  ` +
          `complete ${fixture.complete}  ` +
          `${fixture.date ? fixture.date.toISOString() : "no kick-off stored"}`
      );
    });

    // The count matters as much as the list. A handful is the leftover this
    // was written for; most of the season means Squiggle answered badly, and
    // deleting on that answer is how a database gets emptied.
    console.log(
      `\nNothing was deleted. Run a season sync to remove them, or check ` +
        `Squiggle first if that list looks longer than it should.`
    );
  } finally {
    await mongoose.disconnect();
  }
})();

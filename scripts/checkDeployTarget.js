// Read-only readiness check for a database you are about to deploy against:
//
//   MONGODB_URI="mongodb+srv://..." node scripts/checkDeployTarget.js
//
// Written for the Atlas cluster that has been sitting since the Heroku
// deployment. That data predates the current schema, so the point is to find
// out what is actually in there before the app points at it, rather than
// after.
//
// Nothing here writes unless you ask twice. To remove what it reports:
//
//   --purge-legacy-standings --yes    the old global ladder rows
//   --purge-orphan-tips --yes         tips with no user, round or season
//
// The flag on its own reports what it would delete without touching anything.

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const PURGE_STANDINGS = process.argv.includes("--purge-legacy-standings");
const PURGE_TIPS = process.argv.includes("--purge-orphan-tips");
const CONFIRMED = process.argv.includes("--yes");

// Standings used to be a single global ladder with no season or round. Those
// rows are meaningless now and sort oddly against the current unique index.
const LEGACY_STANDING = {
  $or: [{ year: { $in: [null] } }, { round: { $in: [null] } }],
};

// Tips that cannot be attributed or scored: a tip belongs to one user, in one
// round, in one season, and these are missing at least one of the three. They
// are leftovers from the browser-driven writes, before POST /api/tips
// validated anything - the local database had thirteen, none carrying a
// selection. They also collide as nulls under the unique index on
// user/round/season, which is why that index is partial.
const ORPHAN_TIP = {
  $or: [
    { user: { $not: { $type: "string" } } },
    { round: { $not: { $type: "number" } } },
    { season: { $not: { $type: "number" } } },
  ],
};

const line = (label, value) => console.log(`  ${label.padEnd(34)} ${value}`);

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  console.log(`\nDatabase: ${db.databaseName}`);
  if (db.databaseName === "test") {
    console.log(
      "  WARNING: connected to 'test'. The connection string is missing the\n" +
        "  database name - add /twin-tips before the query string, or the app\n" +
        "  will start cleanly and find none of your data."
    );
  }

  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log(`\nCollections (${names.length}):`);
  for (const name of names) {
    line(name, await db.collection(name).countDocuments({}));
  }

  const standings = db.collection("standings");

  console.log("\nLadder snapshots:");
  const legacy = await standings.countDocuments(LEGACY_STANDING);
  const total = await standings.countDocuments({});
  line("rows total", total);
  line("legacy rows (no year or round)", legacy);

  const seasons = await standings.distinct("year", { year: { $ne: null } });
  line("seasons present", seasons.sort().join(", ") || "(none)");

  // A duplicate here stops the unique index being built, and Mongoose reports
  // that failure on the model rather than by refusing to start.
  const dupes = await standings
    .aggregate([
      { $match: { year: { $ne: null } } },
      {
        $group: {
          _id: { year: "$year", round: "$round", id: "$id" },
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  line("duplicate year/round/team keys", dupes.length ? `${dupes.length}+ FOUND` : "none");
  dupes.forEach((d) =>
    console.log(`      year ${d._id.year} round ${d._id.round} team ${d._id.id} x${d.n}`)
  );

  // Fixtures carry a unique index on Squiggle's game id, and the read path is
  // indexed on year and round. Neither exists on a database that predates
  // them, so both get built the first time the app connects here - and a
  // duplicate id makes that build fail. Mongoose reports an index failure on
  // the model rather than by refusing to start, so it reads as success.
  const fixtures = db.collection("fixtures");
  console.log("\nFixtures:");
  line("rows total", await fixtures.countDocuments({}));

  const fixtureDupes = await fixtures
    .aggregate([
      { $group: { _id: "$id", n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  line(
    "duplicate game ids",
    fixtureDupes.length ? `${fixtureDupes.length}+ FOUND` : "none"
  );
  fixtureDupes.forEach((d) => console.log(`      game id ${d._id} x${d.n}`));
  if (fixtureDupes.length) {
    console.log("      WARNING: the unique index on id will fail to build.");
  }

  const noId = await fixtures.countDocuments({ id: { $not: { $type: "number" } } });
  line("rows with no game id", noId);
  if (noId > 1) {
    // One is fine - they all collide as a single null. More than one is not.
    console.log("      WARNING: these collide under the unique index on id.");
  }

  console.log("\nIndexes:");
  for (const name of ["standings", "fixtures", "tips", "users"]) {
    if (!names.includes(name)) continue;
    const idx = await db.collection(name).indexes();
    line(name, idx.map((i) => i.name).join(", "));
  }

  if (names.includes("users")) {
    const users = db.collection("users");
    console.log("\nAccounts:");
    line("users", await users.countDocuments({}));
    line("admins", await users.countDocuments({ admin: true }));
    // No admin means nobody can reach the admin-only routes in the deployed
    // app, and there is no way to grant it from the UI.
    if ((await users.countDocuments({ admin: true })) === 0) {
      console.log("      WARNING: no admin account exists.");
    }
  }

  const tips = db.collection("tips");
  const orphans = await tips.countDocuments(ORPHAN_TIP);

  console.log("\nTips:");
  line("rows total", await tips.countDocuments({}));
  line("orphans (no user/round/season)", orphans);

  // The unique index on user/round/season is what stops a double submission
  // becoming two tips. It is partial - it only covers documents that have all
  // three - so the orphans above cannot break it, but two real tips for the
  // same user and round can, and that build failure is silent too.
  const tipDupes = await tips
    .aggregate([
      {
        $match: {
          user: { $type: "string" },
          round: { $type: "number" },
          season: { $type: "number" },
        },
      },
      {
        $group: {
          _id: { user: "$user", round: "$round", season: "$season" },
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  line(
    "duplicate user/round/season",
    tipDupes.length ? `${tipDupes.length}+ FOUND` : "none"
  );
  tipDupes.forEach((d) =>
    console.log(
      `      user ${d._id.user} round ${d._id.round} season ${d._id.season} x${d.n}`
    )
  );
  if (tipDupes.length) {
    console.log(
      "      WARNING: the unique index will fail to build, and one of each\n" +
        "      pair is already being ignored when the round is scored."
    );
  }
  if (orphans > 0) {
    // Worth knowing before deleting: an orphan carrying a selection would be
    // someone's actual tip that lost a field, which is a different problem
    // from a leftover empty row.
    const salvageable = await tips.countDocuments({
      ...ORPHAN_TIP,
      $and: [
        {
          $or: [
            { topEightSelection: { $type: "string" } },
            { bottomTenSelection: { $type: "string" } },
          ],
        },
      ],
    });
    line("of those, carrying a selection", salvageable);
    if (salvageable > 0) {
      console.log("      WARNING: look at these before purging.");
    }
  }

  if (PURGE_STANDINGS) {
    if (!CONFIRMED) {
      console.log(
        `\n--purge-legacy-standings would delete ${legacy} row(s). ` +
          "Re-run with --yes to actually do it."
      );
    } else {
      const res = await standings.deleteMany(LEGACY_STANDING);
      console.log(`\nDeleted ${res.deletedCount} legacy ladder row(s).`);
      console.log("Run `npm run sync` afterwards to rebuild the snapshots.");
    }
  } else if (legacy > 0) {
    console.log(
      `\n${legacy} legacy ladder row(s) to clear:\n` +
        "  node scripts/checkDeployTarget.js --purge-legacy-standings --yes\n" +
        "then `npm run sync` to rebuild the snapshots."
    );
  }

  if (PURGE_TIPS) {
    if (!CONFIRMED) {
      console.log(
        `\n--purge-orphan-tips would delete ${orphans} tip(s). ` +
          "Re-run with --yes to actually do it."
      );
    } else {
      const res = await tips.deleteMany(ORPHAN_TIP);
      console.log(`\nDeleted ${res.deletedCount} orphan tip(s).`);
    }
  } else if (orphans > 0) {
    console.log(
      `\n${orphans} orphan tip(s) to clear:\n` +
        "  node scripts/checkDeployTarget.js --purge-orphan-tips --yes"
    );
  }

  console.log("");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("Check failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

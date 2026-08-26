// Read-only readiness check for a database you are about to deploy against:
//
//   MONGODB_URI="mongodb+srv://..." node scripts/checkDeployTarget.js
//
// Written for the Atlas cluster that has been sitting since the Heroku
// deployment. That data predates the current schema, so the point is to find
// out what is actually in there before the app points at it, rather than
// after.
//
// Nothing here writes. To remove the legacy ladder rows it reports, re-run
// with --purge-legacy-standings --yes.

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const PURGE = process.argv.includes("--purge-legacy-standings");
const CONFIRMED = process.argv.includes("--yes");

// Standings used to be a single global ladder with no season or round. Those
// rows are meaningless now and sort oddly against the current unique index.
const LEGACY_STANDING = {
  $or: [{ year: { $in: [null] } }, { round: { $in: [null] } }],
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

  if (PURGE) {
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

  console.log("");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("Check failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

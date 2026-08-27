// Merges the duplicate Rhys Arnold account into the one that can still be
// signed into, then removes the orphan:
//
//   node scripts/mergeDuplicateAccount.js            report what it would do
//   node scripts/mergeDuplicateAccount.js --apply    do it
//
// Two accounts were registered a week apart in March 2021 on the same address,
// differing only by a capital R. Email is lowercased on queries as well as
// writes now, so a sign-in for "Rhys.arnold@..." is looked up as
// "rhys.arnold@..." - the capital-R account cannot be reached at all. It still
// holds one 2022 tip, which is the only reason this is a merge rather than a
// deletion.
//
// Written for one known pair rather than as a general tool: it refuses to run
// if what it finds does not match what was checked by hand.

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const APPLY = process.argv.includes("--apply");

// The orphan, and the account to keep.
const ORPHAN_ID = "6048cbf0d064e0002a0daaf6";
const KEEP_ID = "6051daabbc5af6002a0eed98";
const EXPECTED_EMAIL = "rhys.arnold@hotmail.com";

async function main() {
  await mongoose.connect(MONGODB_URI);
  const users = mongoose.connection.collection("users");
  const tips = mongoose.connection.collection("tips");
  const { ObjectId } = mongoose.mongo;

  const orphan = await users.findOne({ _id: new ObjectId(ORPHAN_ID) });
  const keep = await users.findOne({ _id: new ObjectId(KEEP_ID) });

  // Every assumption checked before anything is written. If the database is
  // not in the state this was written for, stop rather than guess.
  if (!orphan || !keep) {
    throw new Error("One of the two accounts is missing. Nothing done.");
  }
  if (String(orphan.email).toLowerCase() !== EXPECTED_EMAIL) {
    throw new Error(`Orphan email is ${orphan.email}, expected ${EXPECTED_EMAIL}. Nothing done.`);
  }
  if (String(keep.email) !== EXPECTED_EMAIL) {
    throw new Error(`Kept email is ${keep.email}, expected ${EXPECTED_EMAIL}. Nothing done.`);
  }

  const moving = await tips.find({ user: ORPHAN_ID }).toArray();
  const existing = await tips.find({ user: KEEP_ID }).toArray();

  console.log(`  orphan:  ${orphan.email}  (${orphan._id})  ${moving.length} tips`);
  console.log(`  keeping: ${keep.email}  (${keep._id})  ${existing.length} tips`);
  console.log("");

  // A tip is unique on user + round + season. Moving one onto a user that
  // already has that round in that season would violate the index, so check
  // rather than discover it mid-write.
  const held = new Set(existing.map((t) => `${t.season}-${t.round}`));
  const clashes = moving.filter((t) => held.has(`${t.season}-${t.round}`));

  moving.forEach((t) =>
    console.log(
      `  moving tip: season ${t.season} round ${t.round}  ` +
        `top8 ${t.topEightSelection}  bottom10 ${t.bottomTenSelection}`
    )
  );

  if (clashes.length) {
    console.error("\n  Both accounts hold a tip for the same round and season:");
    clashes.forEach((t) => console.error(`    season ${t.season} round ${t.round}`));
    console.error("  Resolve by hand. Nothing done.");
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log(`\n  Report only. Re-run with --apply to move ${moving.length} tip(s) and delete the orphan.`);
    await mongoose.disconnect();
    return;
  }

  const moved = await tips.updateMany({ user: ORPHAN_ID }, { $set: { user: KEEP_ID } });
  console.log(`\n  Moved ${moved.modifiedCount} tip(s).`);

  const removed = await users.deleteOne({ _id: new ObjectId(ORPHAN_ID) });
  console.log(`  Deleted ${removed.deletedCount} account.`);

  const after = await tips.countDocuments({ user: KEEP_ID });
  const orphanLeft = await tips.countDocuments({ user: ORPHAN_ID });
  console.log(`\n  ${keep.email} now holds ${after} tips; ${orphanLeft} left behind.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

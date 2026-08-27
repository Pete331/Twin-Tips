// Gives every existing account a username, derived from the name it already
// has:
//
//   node scripts/backfillUsernames.js              report what it would do
//   node scripts/backfillUsernames.js --apply      write it
//
// Usernames arrived after these accounts did, and the field is required, so
// this has to run before the app that expects it. Reporting is the default
// because that ordering makes it easy to run against the wrong database.
//
// Peter Brennan becomes "peterb". A collision takes a number - "peterb2" -
// compared case-insensitively, so it will not pick a name that differs from an
// existing one only by capitals. Anyone who dislikes what they get can change
// it in Settings.

const mongoose = require("mongoose");
require("dotenv").config();

const {
  USERNAME_COLLATION,
  validUsername,
  isReservedUsername,
} = require("../utils/username");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const APPLY = process.argv.includes("--apply");

// First name plus last initial, stripped of anything the rules disallow -
// apostrophes and hyphens in names like O'Brien or Smith-Jones, and spaces in
// a double-barrelled first name.
const baseFrom = (user) => {
  const first = String(user.firstName || "").replace(/[^A-Za-z0-9]/g, "");
  const last = String(user.lastName || "").replace(/[^A-Za-z0-9]/g, "");
  const base = (first + last.slice(0, 1)).toLowerCase();

  // Short names still have to clear the three-character minimum. "Jo Li"
  // gives "jol"; a single-letter first name with no last name would not, so
  // fall back to something that always validates.
  if (base.length >= 3) return base.slice(0, 20);
  return (base + "tipper").slice(0, 20);
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  const users = mongoose.connection.collection("users");

  const missing = await users
    .find({ $or: [{ username: { $exists: false } }, { username: null }, { username: "" }] })
    .toArray();

  const total = await users.countDocuments();
  console.log(`${total} accounts, ${missing.length} without a username.`);

  if (missing.length === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Every username already in use, lowercased, so collisions are caught the
  // same way the index catches them.
  const taken = new Set(
    (await users.find({ username: { $type: "string" } }).toArray())
      .map((u) => String(u.username).toLowerCase())
      .filter(Boolean)
  );

  const planned = [];
  for (const user of missing) {
    const base = baseFrom(user);
    let candidate = base;
    let n = 1;
    // A reserved name is treated as taken, so "admin" becomes "admin2" rather
    // than handing someone a name the app will not accept from the form.
    while (taken.has(candidate.toLowerCase()) || isReservedUsername(candidate)) {
      n += 1;
      const suffix = String(n);
      candidate = base.slice(0, 20 - suffix.length) + suffix;
    }
    taken.add(candidate.toLowerCase());
    planned.push({ _id: user._id, email: user.email, username: candidate });
  }

  // A derived name that does not pass the rules would be written and then
  // rejected the next time that user saved anything. Stop instead.
  const invalid = planned.filter((p) => !validUsername(p.username));
  if (invalid.length) {
    console.error("\nThese derived usernames do not pass validation:");
    invalid.forEach((p) => console.error(`  ${p.email} -> "${p.username}"`));
    console.error("Fix the rule or set these by hand. Nothing written.");
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  console.log("");
  planned.forEach((p) => console.log(`  ${p.email}  ->  ${p.username}`));

  if (!APPLY) {
    console.log(`\nReport only. Re-run with --apply to write these ${planned.length}.`);
    await mongoose.disconnect();
    return;
  }

  for (const p of planned) {
    await users.updateOne({ _id: p._id }, { $set: { username: p.username } });
  }
  console.log(`\nWrote ${planned.length} usernames.`);

  // The unique index is what actually guarantees this, and it needs the same
  // collation as every lookup. Created here so the backfill and the index
  // arrive together rather than on whenever the app next starts.
  await users.createIndex(
    { username: 1 },
    { unique: true, collation: USERNAME_COLLATION }
  );
  console.log("Unique index on username created (collation en/strength 2).");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

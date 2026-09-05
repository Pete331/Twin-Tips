// Backfills joinedAtSeason on memberships written before the field existed.
//
// A membership stores the round somebody joined at. Until now it stored no
// season, so a stored `joinedAtRound: 3` could mean round 3 of any season the
// league has run. memberFrom coped by only trusting the round while the league
// was in its first season - which is why F1 in the 2026-09-05 audit exists.
//
// The backfill is only provably correct while that is still true. Every
// membership today belongs to a league in its first season, so there is exactly
// one season the round can mean: league.createdSeason. Once a league has run a
// second season and people have joined during it, a bare round number is
// genuinely ambiguous and no script can resolve it. That is the reason to run
// this now rather than later.
//
// memberFrom already reads a missing joinedAtSeason as league.createdSeason, so
// this changes no behaviour. It writes down what the code is currently assuming,
// so the assumption stops being load-bearing.
//
// Usage:
//   node scripts/backfillJoinedAtSeason.js          report only, writes nothing
//   node scripts/backfillJoinedAtSeason.js --apply  write them

require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const db = require("../models");

const APPLY = process.argv.includes("--apply");
const URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";

const line = (s) => console.log(`  ${s}`);

const main = async () => {
  await mongoose.connect(URI);
  line(`database ${URI.replace(/\/\/[^@]*@/, "//***@")}`);
  line(APPLY ? "mode: APPLY" : "mode: report only (pass --apply to write)");
  console.log();

  const leagues = await db.League.find({}).select("name slug createdSeason");
  const bySlug = new Map(leagues.map((l) => [String(l._id), l]));

  const missing = await db.LeagueMembership.find({
    $or: [{ joinedAtSeason: { $exists: false } }, { joinedAtSeason: null }],
  }).select("league user joinedAtRound");

  line(`${missing.length} membership(s) without joinedAtSeason`);

  if (!missing.length) {
    line("nothing to do");
    await mongoose.disconnect();
    return;
  }

  // A league whose createdSeason is missing cannot be backfilled from, and
  // guessing one would be exactly the ambiguity this script exists to avoid.
  const writes = [];
  const skipped = [];

  for (const m of missing) {
    const league = bySlug.get(String(m.league));
    if (!league || !Number.isFinite(league.createdSeason)) {
      skipped.push(m);
      continue;
    }
    writes.push({
      updateOne: {
        filter: { _id: m._id },
        update: { $set: { joinedAtSeason: league.createdSeason } },
      },
    });
  }

  const tally = new Map();
  for (const m of missing) {
    const league = bySlug.get(String(m.league));
    const key = league
      ? `${league.name} (${league.slug}) -> ${league.createdSeason}`
      : "league missing";
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  console.log();
  for (const [k, v] of tally) line(`${String(v).padStart(3)}  ${k}`);
  console.log();

  if (skipped.length) {
    line(`${skipped.length} skipped: no league, or the league has no createdSeason`);
  }

  if (!APPLY) {
    line(`would write ${writes.length}. Re-run with --apply.`);
    await mongoose.disconnect();
    return;
  }

  if (writes.length) {
    const result = await db.LeagueMembership.bulkWrite(writes);
    line(`wrote ${result.modifiedCount ?? writes.length}`);
  }

  const left = await db.LeagueMembership.countDocuments({
    $or: [{ joinedAtSeason: { $exists: false } }, { joinedAtSeason: null }],
  });
  line(`${left} still without joinedAtSeason`);

  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error(`failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

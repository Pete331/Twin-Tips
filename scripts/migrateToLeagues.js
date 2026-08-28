// Moves the database to the leagues model:
//
//   node scripts/migrateToLeagues.js            report what it would do
//   node scripts/migrateToLeagues.js --apply    do it
//
// Six steps, in this order, all idempotent - re-running after a partial run
// picks up where it stopped rather than duplicating anything.
//
//   1. Convert Tip.user from a string to an ObjectId.
//   2. Rebuild the partial unique index, whose filter tested for a string.
//   3. Create the default league.
//   4. Put every existing user in it.
//   5. Backfill LeagueRoundResult from the winnings already on tips.
//   6. Verify the league's standings match what the Leaderboard shows today.
//
// Ship this in the same deploy as the models. Adding memberships without the
// backfill leaves existing tips unreachable by any league-scoped query, and
// the Leaderboard goes blank for everyone.

const mongoose = require("mongoose");
require("dotenv").config();

const { slugify } = require("../utils/leagueCodes");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const APPLY = process.argv.includes("--apply");

// Weekly, because that is what Twin Tips has always been: a pool every round,
// with winnings accumulating across the season. A season ladder ranks on tips
// and margin and never shows winnings at all, which would have left every
// backfilled point invisible.
const DEFAULT_LEAGUE = {
  name: "Twin Tips Original",
  type: "weekly",
  buyIn: 5,
};

const line = (s = "") => console.log(`  ${s}`);

// ---------------------------------------------------------------------------

const convertTipUsers = async (db) => {
  const tips = mongoose.connection.collection("tips");

  const stringUsers = await tips.countDocuments({ user: { $type: "string" } });
  const objectUsers = await tips.countDocuments({ user: { $type: "objectId" } });
  // The 2022 shells with no user at all. They cannot be converted and must not
  // stop the run.
  const noUser = await tips.countDocuments({
    $or: [{ user: { $exists: false } }, { user: null }],
  });

  line(`tips: ${stringUsers} with a string user, ${objectUsers} already converted, ${noUser} with none`);

  if (!stringUsers) return { converted: 0, skipped: noUser };

  if (!APPLY) return { converted: 0, skipped: noUser, wouldConvert: stringUsers };

  // One at a time rather than an aggregation pipeline update: a string that is
  // not a valid ObjectId would abort the whole pipeline, and any such row is
  // worth reporting rather than crashing on.
  const cursor = tips.find({ user: { $type: "string" } });
  let converted = 0;
  let unconvertible = 0;

  for await (const tip of cursor) {
    if (!mongoose.isValidObjectId(tip.user)) {
      line(`  ! tip ${tip._id} has a user that is not an id: ${JSON.stringify(tip.user)}`);
      unconvertible += 1;
      continue;
    }
    await tips.updateOne(
      { _id: tip._id },
      { $set: { user: new mongoose.mongo.ObjectId(String(tip.user)) } }
    );
    converted += 1;
  }

  return { converted, skipped: noUser, unconvertible };
};

// The index's partial filter tested user against $type: "string". After the
// conversion it matches nothing, so the constraint silently stops applying -
// which looks exactly like it still working.
const rebuildTipIndex = async () => {
  const tips = mongoose.connection.collection("tips");
  const indexes = await tips.indexes();

  const existing = indexes.find(
    (i) => i.name !== "_id_" && i.key && i.key.user === 1 && i.key.round === 1 && i.key.season === 1
  );

  const filter = existing && existing.partialFilterExpression;
  const type = filter && filter.user && filter.user.$type;

  line(`tip unique index: ${existing ? `${existing.name}, filter user $type "${type}"` : "missing"}`);

  if (type === "objectId") {
    line("  already rebuilt");
    return { rebuilt: false };
  }

  if (!APPLY) return { rebuilt: false, wouldRebuild: true };

  if (existing) await tips.dropIndex(existing.name);
  await tips.createIndex(
    { user: 1, round: 1, season: 1 },
    {
      unique: true,
      partialFilterExpression: {
        user: { $type: "objectId" },
        round: { $type: "number" },
        season: { $type: "number" },
      },
    }
  );

  return { rebuilt: true };
};

const createDefaultLeague = async (db, season, firstRound) => {
  const existing = await db.League.findOne({ name: DEFAULT_LEAGUE.name });
  if (existing) {
    line(`league: "${existing.name}" already exists (${existing.slug}, ${existing.type})`);

    // An earlier run of this script created it as a season ladder, before it
    // was settled that Twin Tips is a weekly competition. Correcting it here
    // rather than by hand keeps the script the one description of the target
    // state, and re-running it safe.
    if (existing.type !== DEFAULT_LEAGUE.type) {
      line(`  type is ${existing.type}, should be ${DEFAULT_LEAGUE.type}`);
      if (APPLY) {
        await db.League.updateOne(
          { _id: existing._id },
          { $set: { type: DEFAULT_LEAGUE.type } }
        );
        line(`  changed to ${DEFAULT_LEAGUE.type}`);
        existing.type = DEFAULT_LEAGUE.type;
      }
    }

    return existing;
  }

  // The founding member administers it. Oldest account, which is the closest
  // thing the data has to "whoever started this".
  const founder = await db.User.findOne().sort({ createdAt: 1, _id: 1 });
  if (!founder) throw new Error("No users, so nobody can administer a league.");

  // "would create" only when it would. Saying it while actually creating made
  // an applied run read like a dry one.
  line(
    `league: ${APPLY ? "creating" : "would create"} ` +
      `"${DEFAULT_LEAGUE.name}", ${DEFAULT_LEAGUE.type}, ` +
      `admin ${founder.username || founder.email}, ` +
      `${season} from round ${firstRound}`
  );

  if (!APPLY) return null;

  return db.League.create({
    ...DEFAULT_LEAGUE,
    slug: slugify(DEFAULT_LEAGUE.name),
    admin: founder._id,
    createdSeason: season,
    startRound: firstRound,
  });
};

const addEveryone = async (db, league, firstRound) => {
  const users = await db.User.find({}).select("_id username email");
  if (!league) {
    line(`memberships: would add ${users.length} users once the league exists`);
    return { added: 0 };
  }

  const already = await db.LeagueMembership.find({ league: league._id }).select("user");
  const have = new Set(already.map((m) => String(m.user)));
  const missing = users.filter((u) => !have.has(String(u._id)));

  line(`memberships: ${have.size} present, ${missing.length} to add`);

  if (!APPLY || !missing.length) return { added: 0 };

  await db.LeagueMembership.insertMany(
    missing.map((u) => ({
      league: league._id,
      user: u._id,
      joinedAtRound: firstRound,
    }))
  );

  return { added: missing.length };
};

// Winnings already sit on each tip, from before leagues existed. They belong to
// the default league now - it is the competition those rounds were played in.
const backfillResults = async (db, league) => {
  if (!league) {
    line("results: would backfill once the league exists");
    return { written: 0 };
  }

  const scored = await db.Tip.find({
    user: { $type: "objectId" },
    season: { $type: "number" },
    round: { $type: "number" },
  }).select("user season round winnings");

  line(`results: ${scored.length} scored tips to carry over`);

  if (!APPLY || !scored.length) return { written: 0 };

  // Upserted on the unique key, so a re-run corrects rather than duplicates.
  const ops = scored.map((tip) => ({
    updateOne: {
      filter: {
        league: league._id,
        season: tip.season,
        round: tip.round,
        user: tip.user,
      },
      update: { $set: { winnings: tip.winnings || 0 } },
      upsert: true,
    },
  }));

  const result = await db.LeagueRoundResult.bulkWrite(ops);
  return { written: (result.upsertedCount || 0) + (result.modifiedCount || 0) };
};

// The point of the backfill is that nothing changes for anyone. If the league's
// totals do not match the tips they came from, it did not work.
const verify = async (db, league) => {
  if (!league) {
    line("verify: nothing to check until the league exists");
    return true;
  }

  const [fromTips] = await db.Tip.aggregate([
    { $match: { user: { $type: "objectId" }, season: { $type: "number" } } },
    { $group: { _id: null, total: { $sum: "$winnings" } } },
  ]);

  const [fromLeague] = await db.LeagueRoundResult.aggregate([
    { $match: { league: league._id } },
    { $group: { _id: null, total: { $sum: "$winnings" } } },
  ]);

  const tipTotal = Math.round(((fromTips && fromTips.total) || 0) * 1000) / 1000;
  const leagueTotal = Math.round(((fromLeague && fromLeague.total) || 0) * 1000) / 1000;

  line(`verify: winnings on tips ${tipTotal}, in the league ${leagueTotal}`);

  if (tipTotal !== leagueTotal) {
    line("  ! they disagree - do not deploy on this");
    return false;
  }

  line("  they agree");
  return true;
};

// ---------------------------------------------------------------------------

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = require("../models");
  const seasonService = require("../services/season");

  line(APPLY ? "APPLYING" : "REPORT ONLY - re-run with --apply to write");
  line();

  const state = await seasonService.getSeasonState();
  const season = state.season;
  const firstRound = state.firstRound !== null && state.firstRound !== undefined ? state.firstRound : 1;
  line(`season ${season}, first round ${firstRound}`);
  line();

  await convertTipUsers(db);
  await rebuildTipIndex();
  const league = await createDefaultLeague(db, season, firstRound);
  await addEveryone(db, league, firstRound);
  await backfillResults(db, league);
  line();
  const ok = await verify(db, league);

  line();
  line(APPLY ? (ok ? "Done." : "Finished with a mismatch - see above.") : "Nothing written.");

  await mongoose.disconnect();
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

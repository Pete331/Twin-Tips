// Generates fake tipsters and their tips for a season, so the leaderboard,
// round results and winner logic have something realistic to work on.
//
//   node scripts/seedTips.js 2026            add users and tips
//   node scripts/seedTips.js 2026 --remove   take them all out again
//
// Tips obey the actual rules of the game: one team from the top 8 and one from
// the bottom 10 of the ladder as it stood when the round opened, drawn from two
// different matches, with a margin on one of the two.
//
// Everything it creates is addressed @seed.invalid, so --remove can find it
// without touching real accounts.

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

const db = require("../models");
const standings = require("../services/standings");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const SEED_DOMAIN = "seed.invalid";
const SEED_PASSWORD = "Seed12345";

const TIPSTERS = [
  { firstName: "test", lastName: "tipper", favTeam: 1 },
  { firstName: "seed", lastName: "sullivan", favTeam: 4 },
  { firstName: "demo", lastName: "dawson", favTeam: 10 },
  { firstName: "sample", lastName: "smith", favTeam: 16 },
  { firstName: "dummy", lastName: "doyle", favTeam: 6 },
];

// Deterministic PRNG so re-running produces the same tips rather than a
// different set of results every time.
const makeRandom = (seed) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

const seedEmail = (t) => `${t.firstName}.${t.lastName}@${SEED_DOMAIN}`;

const upsertTipsters = async () => {
  const hash = bcrypt.hashSync(SEED_PASSWORD, 10);
  const users = [];

  for (const tipster of TIPSTERS) {
    const email = seedEmail(tipster);
    await db.User.updateOne(
      { email },
      { $set: { ...tipster, email, password: hash } },
      { upsert: true }
    );
    users.push(await db.User.findOne({ email }));
  }

  return users;
};

const seedSeason = async (year) => {
  const users = await upsertTipsters();
  const rounds = await db.Fixture.distinct("round", { year });
  rounds.sort((a, b) => a - b);

  let written = 0;
  let skipped = [];

  for (const round of rounds) {
    const fixtures = await db.Fixture.find({ year, round });
    // Only rounds that have been played, and only ones with a ladder to judge
    // the top 8 and bottom 10 against. Round 0 has no preceding round, so
    // there is nothing to classify teams by.
    if (!fixtures.length || !fixtures.every((f) => Number(f.complete) === 100)) {
      continue;
    }

    const ladder = await standings.getLadderForRound(year, round);
    if (!ladder.length) {
      skipped.push(round);
      continue;
    }

    const rankOf = new Map(ladder.map((row) => [row.id, row.rank]));

    // Every team playing this round, tagged with the match it is in, so the two
    // selections can be forced into different games.
    const entries = [];
    fixtures.forEach((fixture) => {
      [
        [fixture.hteamid, fixture.hteam],
        [fixture.ateamid, fixture.ateam],
      ].forEach(([teamId, name]) => {
        const rank = rankOf.get(teamId);
        if (!name || !rank) return;
        entries.push({ gameId: fixture.id, name, rank });
      });
    });

    const topEight = entries.filter((e) => e.rank <= 8);
    const bottomTen = entries.filter((e) => e.rank > 8);
    if (!topEight.length || !bottomTen.length) {
      skipped.push(round);
      continue;
    }

    for (const [index, user] of users.entries()) {
      const rand = makeRandom(year * 100000 + round * 100 + index);

      const top = pick(rand, topEight);
      const otherGames = bottomTen.filter((e) => e.gameId !== top.gameId);
      if (!otherGames.length) continue;
      const bottom = pick(rand, otherGames);

      // A margin goes on exactly one of the two selections, which is what the
      // page enforces.
      const marginOnTop = rand() < 0.5;
      const margin = 1 + Math.floor(rand() * 60);

      await db.Tip.updateOne(
        { user: String(user._id), round, season: year },
        {
          $set: {
            user: String(user._id),
            round,
            season: year,
            topEightSelection: top.name,
            bottomTenSelection: bottom.name,
            marginTopEight: marginOnTop ? margin : 0,
            marginBottomTen: marginOnTop ? 0 : margin,
          },
        },
        { upsert: true }
      );
      written += 1;
    }
  }

  return { users: users.length, tips: written, skipped };
};

const removeSeed = async () => {
  const users = await db.User.find({
    email: new RegExp(`@${SEED_DOMAIN}$`),
  });
  const ids = users.map((u) => String(u._id));
  const tips = await db.Tip.deleteMany({ user: { $in: ids } });
  const removed = await db.User.deleteMany({
    email: new RegExp(`@${SEED_DOMAIN}$`),
  });
  return { users: removed.deletedCount, tips: tips.deletedCount };
};

(async () => {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const remove = process.argv.includes("--remove");

  await mongoose.connect(MONGODB_URI);

  try {
    if (remove) {
      const r = await removeSeed();
      console.log(`Removed ${r.users} seed tipster(s) and ${r.tips} tip(s).`);
    } else {
      const r = await seedSeason(year);
      console.log(
        `${r.users} tipsters, ${r.tips} tips across ${year}.` +
          (r.skipped.length
            ? ` Skipped round(s) ${r.skipped.join(", ")} - no ladder to judge them against.`
            : "")
      );
      console.log(`Sign in as any of them with the password ${SEED_PASSWORD}:`);
      TIPSTERS.forEach((t) => console.log(`  ${seedEmail(t)}`));
    }
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();

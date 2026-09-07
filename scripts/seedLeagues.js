// Leagues shaped so the round views can actually be looked at.
//
//   node scripts/seedLeagues.js 2026            create them
//   node scripts/seedLeagues.js 2026 --remove   take them out again
//
// seedTips.js makes tipsters and tips. This makes the leagues around them, and
// it exists because the local data could not exercise the views built on top:
// one league owned every round and the other three owned none, so every case
// worth seeing - a round won by different people in different leagues, a member
// who joined late, a season league's round - had nowhere to happen.
//
// What it builds, and what each one is for:
//
//   The Rivals      weekly from round 1, three of the six tippers. A different
//                   subset means a different winner from the same tips, which
//                   is the whole reason round results are shown per league.
//   Late Starters   weekly from round 12, with one member joining at 18. Rounds
//                   below 12 are before the league; 12 to 17 are before them.
//   The Long Game   a season league, so its rounds rank without paying out.
//
// It also gives the real accounts tips, with deliberate gaps. Without them
// every "you" line reads "you did not enter", which is one state out of four.
//
// Everything it creates is slugged `seed-`, so --remove finds it without
// touching a real league. Tips it adds are left alone by --remove: they are
// legal tips and make the rest of the app worth looking at. To undo everything,
// restore the snapshot instead.

require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");

const db = require("../models");
const standings = require("../services/standings");
const results = require("../services/results");
const leagueRounds = require("../services/leagueRounds");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const SLUG_PREFIX = "seed-";

const line = (s) => console.log(`  ${s}`);

// Same generator seedTips uses: deterministic, so re-running produces the same
// season rather than a different one each time.
const makeRandom = (seed) => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// A legal tip for one user in one round: one side from the top 8, one from the
// bottom 10 of the ladder as it stood when the round opened, from two different
// matches, with a margin on exactly one of them.
const tipFor = async (user, year, round, salt) => {
  const fixtures = await db.Fixture.find({ year, round });
  if (!fixtures.length || !fixtures.every((f) => Number(f.complete) === 100)) {
    return false;
  }

  const ladder = await standings.getLadderForRound(year, round);
  if (!ladder.length) return false;

  const rankOf = new Map(ladder.map((row) => [row.id, row.rank]));
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
  if (!topEight.length || !bottomTen.length) return false;

  const rand = makeRandom(year * 100000 + round * 100 + salt);
  const top = pick(rand, topEight);
  const otherGames = bottomTen.filter((e) => e.gameId !== top.gameId);
  if (!otherGames.length) return false;
  const bottom = pick(rand, otherGames);

  const marginOnTop = rand() < 0.5;
  const margin = 1 + Math.floor(rand() * 60);

  await db.Tip.updateOne(
    { user: user._id, round, season: year },
    {
      $set: {
        user: user._id,
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

  return true;
};

// Rounds these accounts sit out, so "you did not enter" is a state the page
// actually reaches. Missing a round is a free pass in this competition, and it
// has to read differently from coming last.
const SKIPPED = { Pete_331: [5, 13, 22], erinb: [2, 9, 17, 24] };

const giveRealAccountsTips = async (year) => {
  const real = await db.User.find({
    email: { $not: /seed\.invalid$/ },
  }).select("username");

  const played = (await db.Fixture.distinct("round", { year, complete: 100 })).sort(
    (a, b) => a - b
  );

  for (const [index, user] of real.entries()) {
    const skip = new Set(SKIPPED[user.username] || []);
    let written = 0;

    for (const round of played) {
      if (skip.has(round)) continue;
      // Their own salt, so two accounts do not tip identically all season.
      if (await tipFor(user, year, round, 700 + index)) written += 1;
    }

    line(
      `${user.username.padEnd(10)} ${String(written).padStart(3)} tips` +
        (skip.size ? `, sitting out ${[...skip].join(", ")}` : "")
    );
  }
};

// name, type, startRound, and who is in it - by username, with the round each
// joined at.
const LEAGUES = [
  {
    name: "The Rivals",
    type: "weekly",
    buyIn: 10,
    startRound: 1,
    members: [
      ["Pete_331", 1],
      ["testt", 1],
      ["seeds", 1],
    ],
  },
  {
    name: "Late Starters",
    type: "weekly",
    buyIn: 20,
    startRound: 12,
    members: [
      ["demod", 12],
      ["samples", 12],
      // Joined six rounds in, so rounds 12-17 are before them and rounds under
      // 12 are before the league.
      ["Pete_331", 18],
    ],
  },
  {
    name: "The Long Game",
    type: "season",
    startRound: 1,
    members: [
      ["Pete_331", 1],
      ["erinb", 1],
      ["testt", 1],
      ["seeds", 1],
      ["demod", 1],
      ["samples", 1],
      ["dummyd", 1],
    ],
  },
];

const slugFor = (name) =>
  SLUG_PREFIX + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

const create = async (year) => {
  const byName = new Map(
    (await db.User.find({}).select("username")).map((u) => [u.username, u])
  );

  for (const spec of LEAGUES) {
    const slug = slugFor(spec.name);
    const members = spec.members.filter(([username]) => byName.has(username));

    if (!members.length) {
      line(`${spec.name}: none of its members exist, skipped`);
      continue;
    }

    const admin = byName.get(members[0][0]);

    const league = await db.League.findOneAndUpdate(
      { slug },
      {
        $set: {
          name: spec.name,
          slug,
          type: spec.type,
          joinCode: `TWIN-${slug.slice(5, 9).toUpperCase().padEnd(4, "X")}`,
          admin: admin._id,
          createdSeason: year,
          startRound: spec.startRound,
          deletedAt: null,
          ...(spec.buyIn ? { buyIn: spec.buyIn } : {}),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    for (const [username, joinedAtRound] of members) {
      await db.LeagueMembership.findOneAndUpdate(
        { league: league._id, user: byName.get(username)._id },
        { $set: { joinedAtRound, joinedAtSeason: year } },
        { upsert: true }
      );
    }

    line(
      `${spec.name.padEnd(15)} ${spec.type.padEnd(7)} from round ${String(
        spec.startRound
      ).padStart(2)}  ${members.map(([u, r]) => `${u}@${r}`).join(", ")}`
    );
  }
};

// Unbounded, unlike the hourly job. That window exists so a cron does not
// recompute March every hour; seeding wants the whole season scored once.
const scoreEverything = async (year) => {
  const global = await results.calculateSeason(year, { recentRounds: Infinity });
  line(`global scoring: ${global.rounds} rounds, ${global.scored} tips`);

  const leagues = await db.League.find({ deletedAt: null });
  for (const league of leagues) {
    const done = await leagueRounds.scoreSeason(league, year, {
      recentRounds: Infinity,
    });
    line(`${league.name.slice(0, 24).padEnd(26)} ${done.rounds} rounds scored`);
  }
};

const remove = async () => {
  const leagues = await db.League.find({ slug: new RegExp(`^${SLUG_PREFIX}`) });
  if (!leagues.length) return line("no seeded leagues to remove");

  const ids = leagues.map((l) => l._id);
  const memberships = await db.LeagueMembership.deleteMany({ league: { $in: ids } });
  const rounds = await db.LeagueRoundResult.deleteMany({ league: { $in: ids } });
  await db.League.deleteMany({ _id: { $in: ids } });

  line(
    `removed ${leagues.length} league(s), ${memberships.deletedCount} membership(s), ` +
      `${rounds.deletedCount} round result(s)`
  );
  line("tips are left in place - restore a snapshot to undo those");
};

const main = async () => {
  const year = Number(process.argv[2]);
  if (!Number.isInteger(year)) {
    console.error("usage: node scripts/seedLeagues.js <year> [--remove]");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  line(`database ${MONGODB_URI.replace(/\/\/[^@]*@/, "//***@")}`);
  console.log();

  if (process.argv.includes("--remove")) {
    await remove();
  } else {
    line("tips for the real accounts:");
    await giveRealAccountsTips(year);
    console.log();
    line("leagues:");
    await create(year);
    console.log();
    line("scoring:");
    await scoreEverything(year);
  }

  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error(`failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

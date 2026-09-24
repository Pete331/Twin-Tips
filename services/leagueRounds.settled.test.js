// A round that has been paid stays paid.
//
// Weekly scoring runs every hour and re-scores the last few rounds, so that a
// result Squiggle corrects after the siren still moves the money. It re-scored
// them from the league's *current* members, though - while the rows of anybody
// who had left were kept exactly as they were, because leaving a league keeps
// your results. Put those together and a round-2 winner leaving the pool after
// being paid meant the remaining winners were re-split a pot the leaver still
// held a share of: during the review, 5.667 entries paid out against 5 staked.
//
// The entrants of a round are fixed when it is first paid: the result rows
// written then, one for every entrant, winners and losers alike. A re-score
// recomputes the winners among exactly those people, so a correction still
// lands, and nothing that happens to membership afterwards reaches it.
//
// Separately, and found while fixing that: a round was paid as soon as a
// *later* round had finished, whether or not it had finished itself. A round
// with a postponed game went out with that game's picks counted as losses.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const { scoreSeason } = require("./leagueRounds");
const season = require("./season");

const URI =
  process.env.LEAGUE_SETTLED_TEST_URI ||
  "mongodb://localhost/twin-tips-test-leaguesettled";

const YEAR = 2097;

let reachable = true;
test.after(async () => {
  if (!reachable) return;
  try {
    await mongoose.disconnect();
    const client = await MongoClient.connect(URI, {
      serverSelectionTimeoutMS: 1500,
    });
    await client.db().dropDatabase();
    await client.close();
  } catch {
    // Nothing to clean up if it was never reachable.
  }
});

let fixtureId = 970000;
const game = (round, complete, hour = 9) => ({
  id: fixtureId++,
  year: YEAR,
  round,
  roundname: `Round ${round}`,
  is_final: 0,
  hteam: "Adelaide",
  ateam: "Melbourne",
  hteamid: 1,
  ateamid: 11,
  complete,
  hscore: complete === 100 ? 100 : null,
  ascore: complete === 100 ? 80 : null,
  date: new Date(`2097-03-0${round}T0${hour}:00:00Z`),
});

// correctTips and the margin difference are what results.calculateRound
// writes; set directly here, because this is about what the pool does with
// them, not how they are worked out.
const tip = (user, round, correctTips, difference) =>
  db.Tip.create({
    user: user._id,
    season: YEAR,
    round,
    topEightSelection: "Adelaide",
    bottomTenSelection: "Melbourne",
    marginTopEight: 20,
    marginBottomTen: 0,
    correctTips,
    topEightCorrect: correctTips > 0 ? 1 : 0,
    topEightDifference: difference,
  });

let league;
let U;

// Round 1 played and tied: ann and bob on 2 with an exact margin, cat on 1,
// dan on 0 - four entrants, a pot of four, two ways. Round 2 has a game still
// to be played. Round 3 is finished, which is what used to let round 2 through.
const seed = async () => {
  await Promise.all([
    db.Fixture.deleteMany({}),
    db.Tip.deleteMany({}),
    db.User.deleteMany({}),
    db.League.deleteMany({}),
    db.LeagueMembership.deleteMany({}),
    db.LeagueRoundResult.deleteMany({}),
  ]);
  season.forgetFixtures();

  await db.Fixture.create([
    game(1, 100),
    game(1, 100, 6),
    game(2, 100),
    game(2, 0, 6), // postponed: not played yet
    game(3, 100),
    game(3, 100, 6),
  ]);

  U = {};
  for (const name of ["ann", "bob", "cat", "dan"]) {
    U[name] = await db.User.create({
      username: `settled_${name}`,
      email: `${name}@settled.test`,
      password: "x",
      firstName: name,
      lastName: "Settled",
      favTeam: 1,
    });
  }

  league = await db.League.create({
    name: "Settled Pool",
    slug: "settled-pool",
    type: "weekly",
    buyIn: 5,
    admin: U.ann._id,
    createdSeason: YEAR,
    startRound: 1,
  });
  for (const u of Object.values(U)) {
    await db.LeagueMembership.create({
      league: league._id,
      user: u._id,
      joinedAtRound: 1,
      joinedAtSeason: YEAR,
    });
  }

  await tip(U.ann, 1, 2, 0);
  await tip(U.bob, 1, 2, 0);
  await tip(U.cat, 1, 1, 5);
  await tip(U.dan, 1, 0, 30);

  for (const u of Object.values(U)) await tip(u, 2, 1, 10);
  for (const u of Object.values(U)) await tip(u, 3, 1, 10);
};

const paid = async (round) => {
  const rows = await db.LeagueRoundResult.find({
    league: league._id,
    season: YEAR,
    round,
  })
    .populate({ path: "user", select: "username" })
    .lean();
  return Object.fromEntries(
    rows.map((r) => [r.user.username.replace("settled_", ""), r.winnings])
  );
};
const total = (rows) => Object.values(rows).reduce((a, b) => a + b, 0);
const leave = (who) =>
  db.LeagueMembership.deleteOne({ league: league._id, user: U[who]._id });

test("a paid round stays paid", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    reachable = false;
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);

  await t.test(
    "round 1 is paid two ways between the tied winners",
    async () => {
      await seed();
      await scoreSeason(league, YEAR);

      assert.deepEqual(await paid(1), { ann: 2, bob: 2, cat: 0, dan: 0 });
    }
  );

  // The review's B23. bob won round 1 and then leaves; the hourly job runs.
  await t.test("a winner leaving afterwards changes nothing", async () => {
    await seed();
    await scoreSeason(league, YEAR);
    await leave("bob");
    await scoreSeason(league, YEAR);

    const after = await paid(1);
    assert.deepEqual(after, { ann: 2, bob: 2, cat: 0, dan: 0 });
    assert.equal(
      total(after),
      4,
      "the payouts still add up to the four entries staked"
    );
  });

  // The other direction: a loser leaving used to shrink the pot, so the
  // winners' shares fell after they had been paid.
  await t.test("nor does somebody who lost", async () => {
    await seed();
    await scoreSeason(league, YEAR);
    await leave("dan");
    await scoreSeason(league, YEAR);

    assert.deepEqual(await paid(1), { ann: 2, bob: 2, cat: 0, dan: 0 });
  });

  // What the re-scoring is for, and it has to survive the fix: a corrected
  // result moves the money - among the people who entered, including one who
  // has since left.
  await t.test(
    "a corrected result still moves the money, among the same entrants",
    async () => {
      await seed();
      await scoreSeason(league, YEAR);
      await leave("bob");
      await db.Tip.updateOne(
        { user: U.cat._id, season: YEAR, round: 1 },
        { $set: { correctTips: 3 } }
      );
      await scoreSeason(league, YEAR);

      const after = await paid(1);
      assert.deepEqual(after, { ann: 0, bob: 0, cat: 4, dan: 0 });
      assert.equal(total(after), 4);
    }
  );

  // The worst case of it: eve's membership says round 1, as if it had been
  // backdated. An ordinary late joiner carries a later joinedAtRound and was
  // already kept out by memberFrom; this is the one that got through, and the
  // entrant set being fixed is what stops it.
  await t.test(
    "somebody who joins later is not added to a round already paid",
    async () => {
      await seed();
      await scoreSeason(league, YEAR);
      const eve = await db.User.create({
        username: "settled_eve",
        email: "eve@settled.test",
        password: "x",
        firstName: "eve",
        lastName: "Settled",
        favTeam: 1,
      });
      await tip(eve, 1, 2, 0);
      await db.LeagueMembership.create({
        league: league._id,
        user: eve._id,
        joinedAtRound: 1,
        joinedAtSeason: YEAR,
      });
      await scoreSeason(league, YEAR);

      assert.deepEqual(await paid(1), { ann: 2, bob: 2, cat: 0, dan: 0 });
    }
  );

  // Rows from before this fix can belong to an entrant whose tips were deleted
  // with their account. Re-scoring without them would be the original bug by
  // another route, so the round is left exactly as it was paid.
  await t.test(
    "an entrant whose tip has gone leaves the round as it was paid",
    async () => {
      await seed();
      await scoreSeason(league, YEAR);
      await db.Tip.deleteOne({ user: U.bob._id, season: YEAR, round: 1 });
      await db.Tip.updateOne(
        { user: U.cat._id, season: YEAR, round: 1 },
        { $set: { correctTips: 3 } }
      );
      await scoreSeason(league, YEAR);

      assert.deepEqual(await paid(1), { ann: 2, bob: 2, cat: 0, dan: 0 });
    }
  );

  // The second bug. Round 3 is finished, so round 2 was paid - with its
  // unplayed game's picks counting as losses.
  await t.test("a round with a game still to play is not paid", async () => {
    await seed();
    await scoreSeason(league, YEAR);

    assert.deepEqual(
      await paid(2),
      {},
      "nothing is paid on a round that hasn't finished"
    );
    assert.equal(
      Object.keys(await paid(3)).length,
      4,
      "the finished round after it is"
    );
  });

  await t.test("and it is paid once that game has been played", async () => {
    await seed();
    await scoreSeason(league, YEAR);
    await db.Fixture.updateMany(
      { year: YEAR, round: 2 },
      { $set: { complete: 100, hscore: 90, ascore: 80 } }
    );
    season.forgetFixtures();
    await scoreSeason(league, YEAR);

    assert.equal(Object.keys(await paid(2)).length, 4);
  });
});

// A league's round table shows a paid round the way it was paid.
//
// The round table used to work every round out again from the league's
// current members. That was harmless while the stored results were re-split
// the same way every hour. They are not any more - a paid round's entrants are
// fixed when it is first paid (leagueRounds.settled.test.js) - so after
// somebody left, or deleted their account, the two tables disagreed: the
// season table said the three winners of round 1 had each won a third of five
// entries, and the round table said the two who stayed had each won half of
// four.
//
// A paid round now takes its entrants, placings and money from what was paid.
// Its rows are still the league's current members and nobody else - somebody
// who has left is counted in the pot they paid into and never named.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const db = require("../models");
const leagueRounds = require("./leagueRounds");
const season = require("./season");

const URI =
  process.env.LEAGUE_PAID_ROUND_TEST_URI ||
  "mongodb://localhost/twin-tips-test-leaguepaidround";
const YEAR = 2094;

test("a paid round in a league's round table", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);

  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await mongoose.disconnect();
    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

  let league;
  let U;

  // Round 1 played. ann, cat and dan tie on two right with the margin exact;
  // bob has one, eve none. Five entrants, a pot of five, three ways. Round 2 is
  // still being played.
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

    let id = 940000;
    const game = (round, complete, iso) => ({
      id: id++,
      year: YEAR,
      round,
      roundname: `Round ${round}`,
      is_final: 0,
      hteam: "Adelaide",
      ateam: "Melbourne",
      hteamid: 1,
      ateamid: 11,
      complete,
      date: new Date(iso),
    });
    await db.Fixture.create([
      game(1, 100, "2094-03-05T09:00:00Z"),
      game(1, 100, "2094-03-06T06:00:00Z"),
      game(2, 100, "2094-03-12T09:00:00Z"),
      game(2, 40, "2094-03-13T06:00:00Z"),
    ]);

    U = {};
    for (const name of ["ann", "bob", "cat", "dan", "eve"]) {
      U[name] = await db.User.create({
        username: `paid_${name}`,
        email: `${name}@paid.test`,
        password: "x",
        firstName: name,
        lastName: "Paid",
        favTeam: 1,
      });
    }

    league = await db.League.create({
      name: "Paid Pool",
      slug: "paid-pool",
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

    // What results.calculateRound writes, set directly: this is about the
    // pool, not the scoring.
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
    await tip(U.ann, 1, 2, 0);
    await tip(U.bob, 1, 1, 5);
    await tip(U.cat, 1, 2, 0);
    await tip(U.dan, 1, 2, 0);
    await tip(U.eve, 1, 0, 30);
    await tip(U.ann, 2, 1, 3);
    await tip(U.bob, 2, 0, 9);

    await leagueRounds.scoreAllWeekly(YEAR);
  };

  // Leaving, the way routes/leagues.js does it: the membership goes, the
  // results stay.
  const leave = (user) =>
    db.LeagueMembership.deleteOne({ league: league._id, user: user._id });

  const row = (detail, name) =>
    detail.standings.find((s) => s.username === `paid_${name}`);
  const seasonRow = (table, name) =>
    table.standings.find((s) => s.username === `paid_${name}`);
  const names = (detail) => detail.standings.map((s) => s.username);

  await t.test(
    "a winner leaves, and the round still reads as it was paid",
    async () => {
      await seed();
      await leave(U.cat);

      const detail = await leagueRounds.roundDetail(league, YEAR, 1);

      assert.equal(detail.entrants, 5, "five paid in");
      assert.deepEqual([...detail.winners].sort(), ["paid_ann", "paid_dan"]);
      assert.ok(
        Math.abs(row(detail, "ann").winnings - 5 / 3) < 0.01,
        "a third of five each"
      );
      assert.equal(row(detail, "bob").rank, 4, "behind all three winners");
    }
  );

  await t.test("and agrees with the season table", async () => {
    const detail = await leagueRounds.roundDetail(league, YEAR, 1);
    const table = await leagueRounds.weeklyStandings(league, YEAR);

    assert.equal(row(detail, "ann").winnings, seasonRow(table, "ann").winnings);
    assert.equal(row(detail, "dan").winnings, seasonRow(table, "dan").winnings);
  });

  await t.test("the one who left is counted and never named", async () => {
    const detail = await leagueRounds.roundDetail(league, YEAR, 1);

    assert.equal(names(detail).includes("paid_cat"), false, "not a row");
    assert.equal(detail.winners.includes("paid_cat"), false, "not a winner");
  });

  await t.test("a loser leaving does not shrink the pot either", async () => {
    await seed();
    await leave(U.eve);

    const detail = await leagueRounds.roundDetail(league, YEAR, 1);

    assert.equal(detail.entrants, 5);
    assert.ok(
      Math.abs(row(detail, "ann").winnings - 5 / 3) < 0.01,
      "not a third of four"
    );
    assert.equal(names(detail).includes("paid_eve"), false);
  });

  // The money is what was paid, not a second opinion. A result corrected after
  // the re-score window has passed (RESCORE_RECENT_ROUNDS) changes the tips and
  // not the payout, and the round table has to agree with the season table
  // about which of those it is showing.
  await t.test(
    "the money shown is the money paid, even if the tips say otherwise now",
    async () => {
      await seed();
      await db.Tip.updateOne(
        { user: U.dan._id, season: YEAR, round: 1 },
        { correctTips: 1 }
      );

      const detail = await leagueRounds.roundDetail(league, YEAR, 1);
      const table = await leagueRounds.weeklyStandings(league, YEAR);

      assert.equal(row(detail, "dan").won, true, "dan was paid");
      assert.equal(
        row(detail, "dan").winnings,
        seasonRow(table, "dan").winnings
      );
      assert.ok(detail.winners.includes("paid_dan"));
    }
  );

  // An entrant whose tip went with their account, before deletion stopped
  // removing tips. The pot they paid into is still five.
  await t.test("an entrant whose tip is gone is still counted", async () => {
    await seed();
    await db.Tip.deleteOne({ user: U.eve._id, season: YEAR, round: 1 });
    await leave(U.eve);

    const detail = await leagueRounds.roundDetail(league, YEAR, 1);

    assert.equal(detail.entrants, 5);
  });

  // Left after round 1 was paid, came back at round 3. Round 1 is not theirs
  // any more: their tip is fetched for the placings and must not reach their
  // row, which says they joined later.
  await t.test(
    "somebody who left and came back is not shown in a round before they rejoined",
    async () => {
      await seed();
      await leave(U.bob);
      await db.LeagueMembership.create({
        league: league._id,
        user: U.bob._id,
        joinedAtRound: 3,
        joinedAtSeason: YEAR,
      });

      const bob = row(await leagueRounds.roundDetail(league, YEAR, 1), "bob");

      assert.equal(bob.status, "beforeYou");
      assert.equal(bob.topEightSelection, null, "no picks");
      assert.equal(bob.rank, null, "no place");
      assert.equal(bob.winnings, 0);
    }
  );

  // Nothing has been paid while the round is being played, so there is
  // nothing to read back: the table is worked out live, as it always was.
  await t.test(
    "a round not paid yet is still worked out from who is here",
    async () => {
      await seed();
      await leave(U.bob);

      const detail = await leagueRounds.roundDetail(league, YEAR, 2);

      assert.equal(
        detail.entrants,
        1,
        "only ann's round-2 tip belongs to a member"
      );
      assert.deepEqual(detail.winners, ["paid_ann"]);
    }
  );
});

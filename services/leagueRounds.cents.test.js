// A split pot, in whole cents.
//
// Shares are stored exactly, in buy-in units (see poolShare), and three
// winners of a five-entry round each hold 1.6667 of them - $8.333... at a $5
// buy-in. Every page rounded that to $8.33, so the three shares of a $25 pot
// added up to $24.99, and the season balances drifted by the missing cent.
// That was the review's finding #12 (scenario B10).
//
// The largest-remainder method hands the leftover cents to the shares that
// lost most in rounding, so what is shown always adds up to the pot: $8.34,
// $8.33, $8.33. Equal shares lose the same amount, and the spare cent then goes
// by user id - the same person's in every view of the round.
//
// For showing only. Two people who won the same share are level on the ladder,
// whichever of them the cent went to.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const db = require("../models");
const leagueRounds = require("./leagueRounds");
const { inWholeCents } = leagueRounds;
const season = require("./season");

// Dollars, the way the page works them out: units times the buy-in, rounded
// to the cent.
const dollars = (units, buyIn) => Math.round(units * buyIn * 100) / 100;
const cents = (rows, buyIn) => rows.map((r) => Math.round(r.winnings * buyIn * 100));

// --- the arithmetic --------------------------------------------------------

test("three ways of a $25 pot come to $25", () => {
  const rows = ["a", "b", "c", "d", "e"].map((user, i) => ({
    user, winnings: i < 3 ? 5 / 3 : 0,
  }));

  const split = cents(inWholeCents(rows, 5), 5);

  assert.deepEqual(split, [834, 833, 833, 0, 0]);
  assert.equal(split.reduce((a, b) => a + b, 0), 2500);
});

test("the spare cent goes by user id, not by the order the rows came in", () => {
  const rows = [
    { user: "c", winnings: 5 / 3 }, { user: "a", winnings: 5 / 3 }, { user: "b", winnings: 5 / 3 },
  ];

  const byUser = Object.fromEntries(
    inWholeCents(rows, 5).map((r) => [r.user, Math.round(r.winnings * 500)])
  );

  assert.deepEqual(byUser, { a: 834, b: 833, c: 833 });
});

test("more than one spare cent goes one each", () => {
  // Seven entries at $1 between three: $2.333... each, one cent over.
  // Eleven at $1 between three: $3.666... each, two cents over.
  assert.deepEqual(
    cents(inWholeCents([{ user: "a", winnings: 7 / 3 }, { user: "b", winnings: 7 / 3 }, { user: "c", winnings: 7 / 3 }], 1), 1),
    [234, 233, 233]
  );
  assert.deepEqual(
    cents(inWholeCents([{ user: "a", winnings: 11 / 3 }, { user: "b", winnings: 11 / 3 }, { user: "c", winnings: 11 / 3 }], 1), 1),
    [367, 367, 366]
  );
});

test("a split that is already whole cents is left alone", () => {
  const rows = [{ user: "a", winnings: 2.5 }, { user: "b", winnings: 2.5 }, { user: "c", winnings: 0 }];

  assert.deepEqual(inWholeCents(rows, 5).map((r) => r.winnings), [2.5, 2.5, 0]);
});

// Nobody who lost gets a cent, however the rounding falls.
test("only winners are handed a spare cent", () => {
  const rows = [
    { user: "a", winnings: 0 }, { user: "b", winnings: 5 / 3 },
    { user: "c", winnings: 5 / 3 }, { user: "d", winnings: 5 / 3 },
  ];

  assert.equal(cents(inWholeCents(rows, 5), 5)[0], 0);
});

// Every pool this app could hold: up to thirty entrants, any number of them
// sharing it, at buy-ins that do and do not divide evenly. The shares always
// add up to the pot, none is more than a cent from its exact value, and
// splitting an already split round again changes nothing.
test("every split adds up, stays within a cent, and is stable", () => {
  for (const buyIn of [1, 3, 5, 7, 10, 25, 1000]) {
    for (let entrants = 1; entrants <= 30; entrants += 1) {
      for (let winners = 1; winners <= entrants; winners += 1) {
        const rows = Array.from({ length: entrants }, (_, i) => ({
          user: `u${String(i).padStart(2, "0")}`,
          winnings: i < winners ? entrants / winners : 0,
        }));
        const once = inWholeCents(rows, buyIn);
        const split = cents(once, buyIn);
        const label = `${winners} of ${entrants} at $${buyIn}`;

        assert.equal(split.reduce((a, b) => a + b, 0), entrants * buyIn * 100, label);
        split.forEach((c, i) =>
          assert.ok(Math.abs(c - rows[i].winnings * buyIn * 100) < 1, label)
        );
        assert.deepEqual(cents(inWholeCents(once, buyIn), buyIn), split, `${label}, twice`);
      }
    }
  }
});

// A season league has no pool, and may have no buy-in to count cents in.
test("with no buy-in there is nothing to round", () => {
  const rows = [{ user: "a", winnings: 5 / 3 }];

  assert.equal(inWholeCents(rows, undefined)[0].winnings, 5 / 3);
  assert.equal(inWholeCents(rows, 0)[0].winnings, 5 / 3);
});

// --- on the pages ----------------------------------------------------------

const URI =
  process.env.LEAGUE_CENTS_TEST_URI ||
  "mongodb://localhost/twin-tips-test-leaguecents";
const YEAR = 2092;

test("a three-way split on the round table and the season table", async (t) => {
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

  // Round 1 played and paid: ann, cat and dan split five entries. Round 2 is
  // being played, and the same three are level in it so far.
  await Promise.all([
    db.Fixture.deleteMany({}), db.Tip.deleteMany({}), db.User.deleteMany({}),
    db.League.deleteMany({}), db.LeagueMembership.deleteMany({}),
    db.LeagueRoundResult.deleteMany({}),
  ]);
  season.forgetFixtures();

  let id = 920000;
  const game = (round, complete, iso) => ({
    id: id++, year: YEAR, round, roundname: `Round ${round}`, is_final: 0,
    hteam: "Adelaide", ateam: "Melbourne", hteamid: 1, ateamid: 11, complete,
    date: new Date(iso),
  });
  await db.Fixture.create([
    game(1, 100, "2092-03-05T09:00:00Z"), game(1, 100, "2092-03-06T06:00:00Z"),
    game(2, 100, "2092-03-12T09:00:00Z"), game(2, 40, "2092-03-13T06:00:00Z"),
  ]);

  const U = {};
  for (const name of ["ann", "bob", "cat", "dan", "eve"]) {
    U[name] = await db.User.create({
      username: `cents_${name}`, email: `${name}@cents.test`, password: "x",
      firstName: name, lastName: "Cents", favTeam: 1,
    });
  }
  const league = await db.League.create({
    name: "Cents Pool", slug: "cents-pool", type: "weekly", buyIn: 5,
    admin: U.ann._id, createdSeason: YEAR, startRound: 1,
  });
  for (const u of Object.values(U)) {
    await db.LeagueMembership.create({
      league: league._id, user: u._id, joinedAtRound: 1, joinedAtSeason: YEAR,
    });
  }

  const tip = (user, round, correctTips, difference) =>
    db.Tip.create({
      user: user._id, season: YEAR, round,
      topEightSelection: "Adelaide", bottomTenSelection: "Melbourne",
      marginTopEight: 20, marginBottomTen: 0,
      correctTips, topEightCorrect: correctTips > 0 ? 1 : 0, topEightDifference: difference,
    });
  for (const round of [1, 2]) {
    await tip(U.ann, round, 2, 0);
    await tip(U.bob, round, 1, 5);
    await tip(U.cat, round, 2, 0);
    await tip(U.dan, round, 2, 0);
    await tip(U.eve, round, 0, 30);
  }

  await leagueRounds.scoreAllWeekly(YEAR);

  const shown = (detail) =>
    detail.standings.filter((s) => s.won).map((s) => dollars(s.winnings, 5));
  const total = (amounts) => Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;

  await t.test("the round table's shares add up to the pot", async () => {
    const detail = await leagueRounds.roundDetail(league, YEAR, 1);

    assert.deepEqual(shown(detail).sort(), [8.33, 8.33, 8.34]);
    assert.equal(total(shown(detail)), 25);
  });

  // Not paid yet, and worked out live - the same rule, the same cent.
  await t.test("so do a round's still being played", async () => {
    const detail = await leagueRounds.roundDetail(league, YEAR, 2);

    assert.deepEqual(shown(detail).sort(), [8.33, 8.33, 8.34]);
  });

  await t.test("the season table shows each person what the round table does", async () => {
    const detail = await leagueRounds.roundDetail(league, YEAR, 1);
    const table = await leagueRounds.weeklyStandings(league, YEAR);

    for (const name of ["ann", "cat", "dan"]) {
      const inRound = detail.standings.find((s) => s.username === `cents_${name}`);
      const inSeason = table.standings.find((s) => s.username === `cents_${name}`);
      assert.equal(dollars(inSeason.winnings, 5), dollars(inRound.winnings, 5), name);
    }
  });

  // Everybody's balance together is what went in less what came out, which
  // over a whole pool is nothing. A lost cent showed as the pool being a cent
  // down.
  await t.test("and the balances add up to nothing", async () => {
    const table = await leagueRounds.weeklyStandings(league, YEAR);

    assert.equal(total(table.standings.map((s) => dollars(s.net, 5))), 0);
  });

  // The cents are split among everybody who won, before anybody who has left
  // is dropped from the view. Split among the ones still here instead, the
  // spare cent would move to one of them when its holder left - and the round
  // would show more than it paid them.
  await t.test("a winner who has left takes their cent with them", async () => {
    const before = await leagueRounds.roundDetail(league, YEAR, 1);
    const holder = before.standings.find((s) => dollars(s.winnings, 5) === 8.34);
    await db.LeagueMembership.deleteOne({ league: league._id, user: holder.user });

    const after = await leagueRounds.roundDetail(league, YEAR, 1);
    const table = await leagueRounds.weeklyStandings(league, YEAR);

    assert.deepEqual(shown(after), [8.33, 8.33]);
    assert.deepEqual(
      table.standings.filter((s) => s.winnings > 0).map((s) => dollars(s.winnings, 5)),
      [8.33, 8.33]
    );

    await db.LeagueMembership.create({
      league: league._id, user: holder.user, joinedAtRound: 1, joinedAtSeason: YEAR,
    });
  });

  await t.test("the cent does not separate people who won the same share", async () => {
    const table = await leagueRounds.weeklyStandings(league, YEAR);
    const winners = table.standings.filter((s) => s.winnings > 0);

    assert.equal(winners.length, 3);
    assert.deepEqual(winners.map((s) => s.rank), [1, 1, 1]);
    assert.ok(winners.every((s) => s.tied || s.rank === 1));
  });
});

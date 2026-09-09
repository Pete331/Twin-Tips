// Reading stored results back, when the stored results outlive the membership.
//
// Leaving a league keeps your results - the member-removal route in
// routes/leagues.js does that on purpose, because the league's history is a
// record of rounds that were played. The cost is a collection that answers a
// plain query with people who are not in the league, and the money makes it
// matter: locally, a departed member holds 25 rows in one league, three of them
// paying $25 each.
//
// resultsFor is the only thing that reads the collection, and these are the
// cases it exists for. leagueRounds.readers.test.js is what stops a second
// reader appearing; this is what says the one reader is right.
//
// Runs against its own database, which it creates and drops. The runner gives
// each file its own process but not its own database, so the name is this
// file's alone.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const { resultsFor, weeklyStandings } = require("./leagueRounds");
const season = require("./season");

const URI =
  process.env.LEAGUE_RESULTS_TEST_URI ||
  "mongodb://localhost/twin-tips-test-leagueresults";

const YEAR = 2092;

let reachable = true;

const connect = async () => {
  if (mongoose.connection.readyState === 1) return true;
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
    return true;
  } catch {
    reachable = false;
    return false;
  }
};

const teardown = async () => {
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
};

after(teardown);

let unique = 0;
let fixtureId = 920000;

const makeUser = (name) => {
  unique += 1;
  return db.User.create({
    username: `${name}${unique}`,
    email: `${name}-${unique}@seed.invalid`,
    password: "x",
    firstName: "Test",
    lastName: "Person",
    favTeam: 1,
  });
};

const makeLeague = async (over = {}) => {
  unique += 1;
  const admin = await makeUser("admin");
  return db.League.create({
    name: "Pool",
    slug: `pool-${unique}`,
    type: "weekly",
    joinCode: `TWIN-R${unique}`,
    admin: admin._id,
    buyIn: 5,
    createdSeason: YEAR,
    startRound: 1,
    ...over,
  });
};

const join = (league, user, over = {}) =>
  db.LeagueMembership.create({
    league: league._id,
    user: user._id,
    joinedAtSeason: YEAR,
    joinedAtRound: 1,
    ...over,
  });

// A stored result, written the way scoreRound writes one.
const paid = (league, user, round, winnings) =>
  db.LeagueRoundResult.create({
    league: league._id,
    season: YEAR,
    round,
    user: user._id,
    winnings,
  });

// Rounds 1-3, all played, so eligibleRounds has something to return.
const seedFixtures = async () => {
  await db.Fixture.deleteMany({ year: YEAR });
  season.forgetFixtures();

  for (const round of [1, 2, 3]) {
    await db.Fixture.create({
      id: fixtureId++,
      year: YEAR,
      round,
      roundname: `Round ${round}`,
      is_final: 0,
      date: new Date(`${YEAR}-04-0${round}T09:20:00Z`),
      complete: 100,
      hteam: "Adelaide",
      hteamid: 1,
      ateam: "Melbourne",
      ateamid: 11,
      hscore: 100,
      ascore: 80,
      winner: "Adelaide",
      winnerteamid: 1,
    });
  }
};

const roundsIn = (rows) => rows.map((r) => r.round).sort((a, b) => a - b);

test("resultsFor", async (t) => {
  if (!(await connect())) {
    t.skip("no local MongoDB listening - skipping");
    return;
  }

  assert.match(
    mongoose.connection.name,
    /test/,
    `refusing to run against database "${mongoose.connection.name}"`
  );

  await seedFixtures();

  await t.test("returns what a current member won", async () => {
    const league = await makeLeague();
    const ann = await makeUser("ann");
    await join(league, ann);
    await paid(league, ann, 1, 0);
    await paid(league, ann, 2, 3);

    const rows = await resultsFor(league, YEAR);

    assert.deepEqual(roundsIn(rows), [1, 2]);
    assert.equal(rows.reduce((sum, r) => sum + r.winnings, 0), 3);
  });

  // The 25-row case, in miniature. Nothing deleted their results when they
  // left, so the rows are still there and still say they won.
  await t.test("drops a departed member's rows, including the paying ones", async () => {
    const league = await makeLeague();
    const ann = await makeUser("ann");
    const gone = await makeUser("gone");

    await join(league, ann);
    await paid(league, ann, 1, 0);

    // No membership for this one - they left, and their rows stayed.
    await paid(league, gone, 1, 5);
    await paid(league, gone, 2, 5);

    const rows = await resultsFor(league, YEAR);

    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].user), String(ann._id));
    assert.equal(
      rows.reduce((sum, r) => sum + r.winnings, 0),
      0,
      "a stranger's winnings must not reach the table"
    );
  });

  // A different question from membership, and the reason countsFor cannot
  // answer both: this member is here now, and rounds 1 and 2 were not theirs.
  await t.test("drops rounds from before a member joined", async () => {
    const league = await makeLeague();
    const late = await makeUser("late");
    await join(league, late, { joinedAtRound: 3 });

    await paid(league, late, 1, 5);
    await paid(league, late, 2, 0);
    await paid(league, late, 3, 5);

    const rows = await resultsFor(league, YEAR);

    assert.deepEqual(roundsIn(rows), [3]);
  });

  // Rejoining must not resurrect a previous stint. The rows were never deleted,
  // so without the joining-round filter they would all come back at once - and
  // arrive as winnings.
  await t.test("a rejoiner does not get their old rows back", async () => {
    const league = await makeLeague();
    const back = await makeUser("back");

    await paid(league, back, 1, 5);
    await paid(league, back, 2, 5);
    await paid(league, back, 3, 0);

    // They come back at round 3, which is the only round now theirs.
    await join(league, back, { joinedAtRound: 3 });

    const rows = await resultsFor(league, YEAR);

    assert.deepEqual(roundsIn(rows), [3]);
    assert.equal(rows[0].winnings, 0);
  });

  // A season they were not in at all. joinedAtSeason is what separates round 2
  // of this year from round 2 of the last.
  await t.test("drops a season the member joined after", async () => {
    const league = await makeLeague();
    const next = await makeUser("next");
    await join(league, next, { joinedAtSeason: YEAR + 1, joinedAtRound: 1 });

    await paid(league, next, 1, 5);

    assert.deepEqual(await resultsFor(league, YEAR), []);
  });

  await t.test("fetches the members itself when not given them", async () => {
    const league = await makeLeague();
    const ann = await makeUser("ann");
    const gone = await makeUser("gone");
    await join(league, ann);
    await paid(league, ann, 1, 2);
    await paid(league, gone, 1, 5);

    const given = await resultsFor(
      league,
      YEAR,
      await db.LeagueMembership.find({ league: league._id }).populate({
        path: "user",
        select: "username",
      })
    );
    const fetched = await resultsFor(league, YEAR);

    assert.equal(fetched.length, 1);
    assert.deepEqual(roundsIn(fetched), roundsIn(given));
  });

  // The table this all exists for, with both filters in play at once: a member
  // who left, whose $25 must not turn up in anybody's total or as an entry, and
  // a member who arrived late, whose earlier rows are not theirs to count.
  //
  // Both, deliberately. With only the departed member here, the test passes
  // against a weeklyStandings that queries the rows directly - its own
  // membership guard covers that one - and says nothing about the round window.
  // Mutation testing is what found that.
  await t.test("the weekly table ignores a departed member entirely", async () => {
    const league = await makeLeague();
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    const gone = await makeUser("gone");
    const late = await makeUser("late");

    await join(league, ann);
    await join(league, bob);
    await join(league, late, { joinedAtRound: 3 });

    // Rounds 1 and 2 were not theirs, round 3 was.
    await paid(league, late, 1, 5);
    await paid(league, late, 2, 5);
    await paid(league, late, 3, 0);

    await paid(league, ann, 1, 2);
    await paid(league, ann, 2, 0);
    await paid(league, bob, 1, 0);
    await paid(league, bob, 2, 2);

    await paid(league, gone, 1, 5);
    await paid(league, gone, 2, 5);
    await paid(league, gone, 3, 5);

    const { standings } = await weeklyStandings(league, YEAR);
    const by = (name) => standings.find((s) => s.username === name);

    assert.equal(standings.length, 3, "only the three members appear");
    assert.equal(
      standings.some((s) => s.username === gone.username),
      false,
      "a departed member must not appear at all"
    );

    const total = standings.reduce((sum, s) => sum + s.winnings, 0);
    assert.equal(total, 4, "the pool paid 4 units to members, not 24");

    assert.equal(by(ann.username).entries, 2);
    assert.equal(by(bob.username).entries, 2);

    // One round, not three: the two before they joined are not entries either.
    assert.equal(by(late.username).entries, 1);
    assert.equal(by(late.username).winnings, 0);
  });
});

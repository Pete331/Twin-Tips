// The window on league scoring, and the conditions that keep it safe.
//
// scoreSeason runs hourly all year for every weekly league. Unbounded it walked
// every settled round every time - 66 queries and 212ms an hour against the
// global half's 31 and 41ms, because this one grows with rounds times leagues
// rather than with rounds alone.
//
// A window is only safe while it cannot hide a round that still needs scoring.
// The two ways that goes wrong, both covered below, are counting back from the
// wrong place (the calendar rather than what has been played) and stepping over
// a round the cron never got to.
//
// Runs against its own database, which it creates and drops. The node test
// runner gives each file its own process but not its own database, so a shared
// name lets two files drop each other's fixtures mid-run.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const { scoreSeason } = require("./leagueRounds");
const season = require("./season");

const URI =
  process.env.LEAGUE_SEASON_TEST_URI ||
  "mongodb://localhost/twin-tips-test-leagueseason";

const YEAR = 2098;

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

// Disconnect before dropping, with a fresh client. Dropping while mongoose is
// still connected lets it recreate the collections behind the drop.
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

let fixtureId = 980000;
let unique = 0;

const fixture = (round, complete) => ({
  id: fixtureId++,
  year: YEAR,
  round,
  roundname: `Round ${round}`,
  hteam: "Adelaide",
  ateam: "Melbourne",
  hteamid: 1,
  ateamid: 11,
  hscore: 100,
  ascore: 80,
  winner: "Adelaide",
  complete,
  is_final: 0,
  date: new Date("2098-03-01T09:00:00Z"),
});

const makeUser = () => {
  unique += 1;
  return db.User.create({
    username: `ls-${unique}`,
    email: `ls-${unique}@seed.invalid`,
    password: "x",
    firstName: "Test",
    lastName: "Person",
    favTeam: 1,
  });
};

const tip = (user, round) =>
  db.Tip.create({
    user: user._id,
    season: YEAR,
    round,
    topEightSelection: "Adelaide",
    marginTopEight: 20,
    correctTips: 1,
    topEightCorrect: 1,
    topEightDifference: 0,
  });

const wipe = async () => {
  await Promise.all([
    db.Fixture.deleteMany({ year: YEAR }),
    db.Tip.deleteMany({ season: YEAR }),
    db.League.deleteMany({}),
    db.LeagueMembership.deleteMany({}),
    db.LeagueRoundResult.deleteMany({}),
  ]);
  // getSeasonState holds the fixture list for half a minute, and each of these
  // tests rewrites it.
  season.forgetFixtures();
};

// A season of `played` complete rounds, one league, one member who tipped all
// of them.
//
// `calendar` is how many rounds the season holds in total, which is not the
// same number: a real season has its whole fixture list from the start and
// plays through it. The two are only equal in a finished season, and a seed
// that always makes them equal cannot tell the window's anchor apart from the
// end of the calendar - which is the mistake the anchor exists to avoid.
const seed = async (played, { complete = 100, calendar = played } = {}) => {
  await wipe();

  for (let r = 1; r <= played; r += 1) await db.Fixture.create(fixture(r, complete));
  for (let r = played + 1; r <= calendar; r += 1) await db.Fixture.create(fixture(r, 0));

  const user = await makeUser();
  unique += 1;
  const league = await db.League.create({
    name: "Rounds Pool",
    slug: `rounds-pool-${unique}`,
    type: "weekly",
    joinCode: "TWIN-ZZZZ",
    admin: user._id,
    buyIn: 15,
    createdSeason: YEAR,
    startRound: 1,
  });

  await db.LeagueMembership.create({
    league: league._id,
    user: user._id,
    joinedAtRound: 1,
    joinedAtSeason: YEAR,
  });

  if (complete === 100) {
    for (let r = 1; r <= played; r += 1) await tip(user, r);
  }

  return { league, user };
};

test("scoreSeason skips rounds settled long ago", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  const { league } = await seed(20);

  // The first pass has nothing written yet, so it must score everything.
  const first = await scoreSeason(league, YEAR, { recentRounds: 4 });
  assert.equal(first.skipped, 0, "a cold database may not skip anything");
  assert.equal(first.rounds, 20);

  const again = await scoreSeason(league, YEAR, { recentRounds: 4 });
  assert.equal(again.skipped, 15, "rounds 1-15 sit outside a four-round window");
  assert.equal(again.rounds, 5, "16-20 are still rescored");
});

// The rescue. If the cron were down for a month, the rounds it missed have to
// be picked up whenever it comes back - and those are exactly the rounds a
// window steps over.
test("a round the cron never scored is picked up however old it is", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  const { league } = await seed(20);
  await scoreSeason(league, YEAR, { recentRounds: 4 });

  // Round 2 loses its result, as though it had never been scored at all.
  await db.LeagueRoundResult.deleteMany({ league: league._id, round: 2 });

  const after = await scoreSeason(league, YEAR, { recentRounds: 4 });
  const round2 = await db.LeagueRoundResult.countDocuments({
    league: league._id,
    season: YEAR,
    round: 2,
  });

  assert.equal(round2, 1, "round 2 was rescored despite being far outside the window");
  assert.equal(after.skipped, 14, "the other fourteen old rounds were still skipped");
});

// The window counts back from the last round actually played, not from the end
// of the calendar. In March the calendar runs to round 24, and counting back
// from there steps over every round being played.
//
// This is the test that separates the two anchors, so it needs a season whose
// calendar is longer than what has been played - mid-season, which is when the
// job actually runs. With ten of twenty-four rounds played the window is
// 6 to 10; anchored on the calendar it would be 20 to 24, and every round with
// football in it would be skipped.
test("the window is anchored on the last round played, not the last on the calendar", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  const { league } = await seed(10, { calendar: 24 });

  await scoreSeason(league, YEAR, { recentRounds: 4 });
  const again = await scoreSeason(league, YEAR, { recentRounds: 4 });

  assert.equal(again.rounds, 5, "rounds 6-10 are inside the window and still rescored");
  assert.equal(again.skipped, 5, "only rounds 1-5 are old enough to skip");
});

test("nothing is skipped before the season has been played", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  const { league } = await seed(24, { complete: 0 });

  const r = await scoreSeason(league, YEAR, { recentRounds: 4 });
  assert.equal(r.skipped, 0);
  assert.equal(r.rounds, 0, "nothing is complete, so there is nothing to score");
});

// The behaviour the window protects, stated as a test. scoreRound divides the
// pool by however many members tipped and only ever upserts - it never removes
// a row - so an unbounded re-score repays every past round with whatever the
// membership looks like today.
test("a settled round keeps the payout it settled with", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  const { league } = await seed(20);
  await scoreSeason(league, YEAR, { recentRounds: 4 });

  const before = await db.LeagueRoundResult.findOne({
    league: league._id,
    season: YEAR,
    round: 1,
  });
  assert.ok(before, "round 1 was scored on the first pass");

  // Someone else joins from the start and tips round 1, which would halve
  // round 1's share if round 1 were rescored.
  const late = await makeUser();
  await db.LeagueMembership.create({
    league: league._id,
    user: late._id,
    joinedAtRound: 1,
    joinedAtSeason: YEAR,
  });
  await tip(late, 1);

  await scoreSeason(league, YEAR, { recentRounds: 4 });

  const after = await db.LeagueRoundResult.findOne({
    league: league._id,
    season: YEAR,
    round: 1,
  });

  assert.equal(
    after.winnings,
    before.winnings,
    "round 1 is outside the window and keeps its original share"
  );
});

// The default is the same number the global half uses, so the two do not drift.
test("the window defaults to the same distance as the global re-score", async (t) => {
  t.after(teardown);
  if (!(await connect())) return t.skip("no local mongod");

  const { RESCORE_RECENT_ROUNDS } = require("./results");
  const { league } = await seed(20);

  await scoreSeason(league, YEAR);
  const again = await scoreSeason(league, YEAR);

  assert.equal(again.skipped, 20 - RESCORE_RECENT_ROUNDS - 1);
});

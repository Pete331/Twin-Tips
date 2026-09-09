// What happened in one league, in one round.
//
// The reason this exists rather than the page reading LeagueRoundResult: those
// rows are upserted and never deleted, so a league keeps rows for people who
// have left. One local league carries 25 of them for a departed member, three
// paying out - and reading them back would name a stranger as the winner of a
// round they were never in. roundDetail builds from memberships joined to tips,
// so somebody who is not in the league cannot appear in its table.
//
// The case that matters most is the one that prompted the whole feature: the
// same round's tips produce different winners in different leagues, because a
// winner is decided among that league's members. The home page used to show a
// single site-wide winner, which is nobody's league winner in particular.
//
// Runs against its own database, which it creates and drops.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const db = require("../models");
const { roundDetail, rankableDifference } = require("./leagueRounds");
const season = require("./season");

const URI =
  process.env.LEAGUE_DETAIL_TEST_URI ||
  "mongodb://localhost/twin-tips-test-leaguedetail";

const YEAR = 2093;

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
let fixtureId = 930000;

const makeUser = (name) => {
  unique += 1;
  return db.User.create({
    username: name,
    email: `${name}-${unique}@seed.invalid`,
    password: "x",
    firstName: "Test",
    lastName: "Person",
    favTeam: 1,
  });
};

// Every league needs an administrator, and none of these tests is about who it
// is - so each gets one of its own, who joins nothing and therefore never turns
// up in a table.
const makeLeague = async (over = {}) => {
  unique += 1;
  const admin = await makeUser(`admin${unique}`);
  return db.League.create({
    name: "Pool",
    slug: `pool-${unique}`,
    type: "weekly",
    joinCode: `TWIN-A${unique}`,
    admin: admin._id,
    buyIn: 15,
    createdSeason: YEAR,
    startRound: 1,
    ...over,
  });
};

// Rounds 1-3, all played.
const seedFixtures = async () => {
  await db.Fixture.deleteMany({ year: YEAR });
  season.forgetFixtures();

  for (const round of [1, 2, 3]) {
    await db.Fixture.create({
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
      complete: 100,
      is_final: 0,
      date: new Date("2093-04-01T09:00:00Z"),
    });
  }
};

// A tip with a chosen accuracy: correctTips decides the order, and the margin
// separates a tie.
const tip = (user, round, correctTips, margin) =>
  db.Tip.create({
    user: user._id,
    season: YEAR,
    round,
    topEightSelection: "Adelaide",
    bottomTenSelection: "Melbourne",
    marginTopEight: 20,
    marginBottomTen: 0,
    correctTips,
    topEightCorrect: 1,
    topEightDifference: margin,
  });

// Users too. Each test names its players the same way - ann, bob, cat - which
// reads far better than a counter, and usernames are unique, so they have to go
// between tests rather than accumulate.
const wipe = async () => {
  await Promise.all([
    db.Tip.deleteMany({ season: YEAR }),
    db.User.deleteMany({}),
    db.League.deleteMany({}),
    db.LeagueMembership.deleteMany({}),
    db.LeagueRoundResult.deleteMany({}),
  ]);
};

const join = (league, user, joinedAtRound = 1) =>
  db.LeagueMembership.create({
    league: league._id,
    user: user._id,
    joinedAtRound,
    joinedAtSeason: YEAR,
  });

const find = (detail, username) =>
  detail.standings.find((s) => s.username === username);

// The whole point of the feature.
test("the same round can be won by different people in different leagues", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  const cat = await makeUser("cat");

  // ann tipped best overall; bob beat cat.
  await tip(ann, 1, 2, 5);
  await tip(bob, 1, 1, 8);
  await tip(cat, 1, 1, 40);

  const big = await makeLeague({ name: "Big" });
  const small = await makeLeague({ name: "Small" });

  await join(big, ann);
  await join(big, bob);
  await join(big, cat);

  // ann is not in the small league, so its round is bob's to win.
  await join(small, bob);
  await join(small, cat);

  const bigRound = await roundDetail(big, YEAR, 1);
  const smallRound = await roundDetail(small, YEAR, 1);

  assert.deepEqual(bigRound.winners, ["ann"]);
  assert.deepEqual(smallRound.winners, ["bob"]);
  assert.equal(
    find(smallRound, "bob").rank,
    1,
    "bob is first in the league ann is not in"
  );
  assert.equal(find(bigRound, "bob").rank, 2, "and second in the one she is");
});

// The bug this avoids. scoreRound never deletes, so a league keeps rows for
// people who have left; reading those back would put them in the table.
test("somebody who has left the league cannot appear in it", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const gone = await makeUser("gone");

  await tip(ann, 1, 1, 20);
  await tip(gone, 1, 2, 1);

  const league = await makeLeague();
  await join(league, ann);

  // A stale result row of exactly the kind the real database carries: a
  // winning row for somebody with no membership.
  await db.LeagueRoundResult.create({
    league: league._id,
    season: YEAR,
    round: 1,
    user: gone._id,
    winnings: 5,
  });

  const detail = await roundDetail(league, YEAR, 1);

  assert.equal(find(detail, "gone"), undefined, "not in the table");
  assert.deepEqual(detail.winners, ["ann"], "and not the winner either");
});

test("a member who has not tipped is absent from the pool, not last in it", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const quiet = await makeUser("quiet");

  await tip(ann, 1, 1, 20);

  const league = await makeLeague();
  await join(league, ann);
  await join(league, quiet);

  const detail = await roundDetail(league, YEAR, 1);

  assert.equal(detail.entrants, 1, "the pool sizes to who tipped");
  assert.equal(find(detail, "quiet").status, "noTip");
  assert.equal(find(detail, "quiet").rank, null, "no place in a round they sat out");
  assert.equal(find(detail, "quiet").winnings, 0);
});

// Missing a round is a free pass, so it must not read as a loss - and a round
// before you joined is a different thing again.
test("a round before you joined says so, rather than reading as a miss", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const late = await makeUser("late");

  await tip(ann, 1, 1, 20);
  await tip(late, 1, 2, 1);

  const league = await makeLeague();
  await join(league, ann, 1);
  await join(league, late, 3);

  const detail = await roundDetail(league, YEAR, 1);

  assert.equal(find(detail, "late").status, "beforeYou");
  assert.equal(detail.entrants, 1, "their tip is not in this league's pool");
  assert.deepEqual(detail.winners, ["ann"], "and cannot win it");
});

test("a round before the league existed is named as such", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  await tip(ann, 1, 2, 1);

  const league = await makeLeague({ startRound: 3 });
  await join(league, ann, 3);

  const detail = await roundDetail(league, YEAR, 1);

  assert.equal(detail.status, "beforeLeague");
  assert.equal(detail.startRound, 3);
  assert.deepEqual(detail.standings, []);
  assert.deepEqual(detail.winners, [], "the shape is the same either way");
});

test("a round nobody entered has no pool and no winner", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const league = await makeLeague();
  await join(league, ann);

  const detail = await roundDetail(league, YEAR, 2);

  assert.equal(detail.status, "noEntries");
  assert.equal(detail.entrants, 0);
  assert.deepEqual(detail.winners, []);
});

// A season league is one contest running all year. Its rounds have a best
// performance but no pool, and a payout column on one would be inventing money.
test("a season league ranks its rounds but pays nothing for them", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  await tip(ann, 1, 2, 5);
  await tip(bob, 1, 1, 8);

  const league = await makeLeague({ type: "season", buyIn: undefined });
  await join(league, ann);
  await join(league, bob);

  const detail = await roundDetail(league, YEAR, 1);

  assert.equal(detail.pays, false);
  assert.deepEqual(detail.winners, [], "nobody wins a round of a season league");
  assert.equal(detail.share, 0);
  assert.equal(find(detail, "ann").rank, 1, "but the round is still ranked");
  assert.equal(find(detail, "bob").rank, 2);
  assert.equal(find(detail, "ann").winnings, 0);
});

test("level on tips and margin is a shared place, and the next place skips", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  const cat = await makeUser("cat");

  await tip(ann, 1, 1, 10);
  await tip(bob, 1, 1, 10);
  await tip(cat, 1, 1, 30);

  const league = await makeLeague();
  await join(league, ann);
  await join(league, bob);
  await join(league, cat);

  const detail = await roundDetail(league, YEAR, 1);

  assert.equal(find(detail, "ann").rank, 1);
  assert.equal(find(detail, "bob").rank, 1);
  assert.equal(find(detail, "cat").rank, 3, "the next place skips past the pair");
  assert.equal(detail.share, 1.5, "and a tied pool splits between them");

  // Both of them, not just whichever the working order put second. The table
  // is displayed in a different order from the one places are worked out in -
  // equal places sort by name - so a flag meaning "level with the row above"
  // marked one of an identical pair and left the other bare.
  assert.equal(find(detail, "ann").tied, true);
  assert.equal(find(detail, "bob").tied, true);
  assert.equal(find(detail, "cat").tied, false, "a place of one is not shared");
});

// The leaderboard shows these rows in the order they arrive, so the order is
// part of the answer rather than the page's problem. Membership order - which
// is what building the map produces - means nothing to a reader.
test("rows come back in the order the round finished", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  const cat = await makeUser("cat");
  const late = await makeUser("late");

  // Joined in this order, finished in another.
  await tip(cat, 1, 1, 30);
  await tip(ann, 1, 2, 5);
  await tip(late, 1, 2, 1);

  const league = await makeLeague();
  await join(league, cat, 1);
  await join(league, bob, 1); // in the league, did not tip
  await join(league, ann, 1);
  await join(league, late, 3); // not in the league for this round

  const detail = await roundDetail(league, YEAR, 1);

  assert.deepEqual(
    detail.standings.map((s) => s.username),
    ["ann", "cat", "bob", "late"],
    "played best-first, then who sat it out, then who had not joined"
  );
  assert.deepEqual(
    detail.standings.map((s) => s.status),
    ["entered", "entered", "noTip", "beforeYou"]
  );
});

// The trap the scoring code has fallen into before: 0 is the best possible
// margin and it is falsy.
test("an exact margin ranks first, not last", () => {
  assert.equal(rankableDifference(0), 0);
  assert.equal(rankableDifference(null), Infinity);
  assert.equal(rankableDifference(undefined), Infinity);
  assert.equal(
    rankableDifference(0) < rankableDifference(null),
    true,
    "predicting exactly beats not predicting at all"
  );
});

test("somebody who predicted no margin ranks behind everyone who did", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");

  // Level on tips. ann was 40 out; bob predicted nothing at all.
  await tip(ann, 1, 1, 40);
  await db.Tip.create({
    user: bob._id,
    season: YEAR,
    round: 1,
    topEightSelection: "Adelaide",
    marginTopEight: 0,
    marginBottomTen: 0,
    correctTips: 1,
  });

  const league = await makeLeague();
  await join(league, ann);
  await join(league, bob);

  const detail = await roundDetail(league, YEAR, 1);

  assert.equal(find(detail, "ann").rank, 1, "a bad prediction still beats none");
  assert.equal(find(detail, "bob").rank, 2);
  assert.equal(find(detail, "bob").marginError, null);
});

// --- before the round bounces ------------------------------------------

// Everybody's tips were private in the browser only: the dashboard declined to
// draw the cells while this handed over every selection regardless. The routes
// now ask tipRules.selectionsVisible and pass the answer in.
//
// The second half of it is not about privacy at all. Before a game is played
// every entrant has zero correct tips and no margin, so pickWinners finds them
// all level and returns the lot - the round names its whole membership as the
// winner and splits the pool between them.

test("a round still open gives up no picks", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  await tip(ann, 1, 2, 5);
  await tip(bob, 1, 1, 8);

  const league = await makeLeague({ name: "Pool" });
  await join(league, ann);
  await join(league, bob);

  const detail = await roundDetail(league, YEAR, 1, null, {
    showSelections: false,
  });

  assert.equal(
    JSON.stringify(detail).includes("Adelaide"),
    false,
    "a pick must not be anywhere in the answer"
  );

  for (const row of detail.standings) {
    assert.equal(row.topEightSelection, null);
    assert.equal(row.bottomTenSelection, null);
    assert.equal(row.marginTopEight, null);
    assert.equal(row.marginBottomTen, null);
    assert.equal(row.correctTips, null);
    assert.equal(row.marginError, null);
  }
});

// Who has entered is not the secret. The dashboard says so already, and it is
// what a reminder would be built on.
test("but it still says who has entered", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  await tip(ann, 1, 2, 5);

  const league = await makeLeague({ name: "Pool" });
  await join(league, ann);
  await join(league, bob);

  const detail = await roundDetail(league, YEAR, 1, null, {
    showSelections: false,
  });

  assert.equal(find(detail, "ann").status, "entered");
  assert.equal(find(detail, "bob").status, "noTip");
  assert.equal(detail.entrants, 1);
});

// The correctness half. Left to itself the round would pay out before a ball
// was kicked, to everybody at once.
test("nobody has won a round that has not been played", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  const cat = await makeUser("cat");

  // Unscored: no correct tips, no margin difference. This is what a round
  // looks like between the tips closing and the games being played.
  for (const user of [ann, bob, cat]) {
    await db.Tip.create({
      user: user._id,
      season: YEAR,
      round: 1,
      topEightSelection: "Adelaide",
      bottomTenSelection: "Melbourne",
      marginTopEight: 20,
      marginBottomTen: 0,
    });
  }

  const league = await makeLeague({ name: "Pool", type: "weekly" });
  await join(league, ann);
  await join(league, bob);
  await join(league, cat);

  const open = await roundDetail(league, YEAR, 1, null, {
    showSelections: false,
  });

  assert.deepEqual(open.winners, [], "nobody has won it yet");
  assert.equal(open.share, 0);
  for (const row of open.standings) {
    assert.equal(row.won, false);
    assert.equal(row.winnings, 0);
    assert.equal(row.rank, null, "everybody level is not a ranking");
    assert.equal(row.tied, false);
  }

  // And the same round with the guard off, which is what the page was being
  // sent: three winners of a round nobody has played.
  const leaked = await roundDetail(league, YEAR, 1, null, {
    showSelections: true,
  });
  assert.equal(leaked.winners.length, 3);
});

// A round that has been played is unaffected - the default, and every existing
// caller.
test("a played round is unchanged when it is allowed to be shown", async (t) => {
  if (!(await connect())) return t.skip("no local mongod");
  await seedFixtures();
  await wipe();

  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  await tip(ann, 1, 2, 5);
  await tip(bob, 1, 1, 8);

  const league = await makeLeague({ name: "Pool" });
  await join(league, ann);
  await join(league, bob);

  const shown = await roundDetail(league, YEAR, 1, null, { showSelections: true });
  const byDefault = await roundDetail(league, YEAR, 1);

  assert.equal(find(shown, "ann").topEightSelection, "Adelaide");
  assert.equal(find(shown, "ann").rank, 1);
  assert.deepEqual(shown.winners, ["ann"]);
  assert.deepEqual(byDefault.winners, shown.winners);
  assert.equal(
    find(byDefault, "ann").topEightSelection,
    find(shown, "ann").topEightSelection
  );
});

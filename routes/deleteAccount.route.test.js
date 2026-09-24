// Deleting an account.
//
// It used to delete the user and every tip they had entered. Two things broke.
// Their tips were part of other people's history: the hourly re-score read a
// paid round again without them, and during the review a player's settled
// winnings changed from 2 to 3 after somebody else deleted their account. And
// a league the deleted user ran was left pointing at an admin who no longer
// existed - nobody could invite, rename, remove a member or close it.
//
// Now the account is anonymised rather than removed, and somebody who runs a
// league with other people in it is asked to hand it over first - the rule the
// leave route already had, which deleting the account used to walk round.
//
// The real route, the real league router, a stand-in session: the pattern the
// other route tests use. Runs against its own database, which it creates and
// drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const results = require("../services/results");
const leagueRounds = require("../services/leagueRounds");
const globalLadder = require("../services/globalLadder");
const season = require("../services/season");
const sessionUsers = require("../services/sessionUsers");

const URI =
  process.env.DELETE_ACCOUNT_TEST_URI ||
  "mongodb://localhost/twin-tips-test-deleteaccount";
const YEAR = 2096;

test("deleting an account", async (t) => {
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

  const sessions = () => mongoose.connection.db.collection("sessions");

  // ---------------------------------------------------------------- seed
  // Round 1 played: Adelaide by 20, Geelong by 10. bob and cat tie on both
  // right with the margin exact; ann has one, dan none. ann runs the pool,
  // which all four are in. dan also runs a league with nobody else in it.
  await Promise.all([
    db.Fixture.deleteMany({}), db.Tip.deleteMany({}), db.User.deleteMany({}),
    db.League.deleteMany({}), db.LeagueMembership.deleteMany({}),
    db.LeagueRoundResult.deleteMany({}), db.GlobalLadder.deleteMany({}),
    sessions().deleteMany({}),
  ]);
  season.forgetFixtures();

  await db.Fixture.create([
    { id: 960001, year: YEAR, round: 1, roundname: "Round 1", is_final: 0, complete: 100,
      hteam: "Adelaide", hteamid: 1, ateam: "Melbourne", ateamid: 11, hscore: 100, ascore: 80,
      winner: "Adelaide", date: new Date("2096-03-05T09:00:00Z") },
    { id: 960002, year: YEAR, round: 1, roundname: "Round 1", is_final: 0, complete: 100,
      hteam: "Geelong", hteamid: 7, ateam: "Richmond", ateamid: 14, hscore: 90, ascore: 80,
      winner: "Geelong", date: new Date("2096-03-06T09:00:00Z") },
  ]);

  const U = {};
  for (const name of ["ann", "bob", "cat", "dan"]) {
    U[name] = await db.User.create({
      username: `del_${name}`, email: `${name}@delete.test`, password: "x",
      firstName: name, lastName: "Deleter", favTeam: 1,
    });
  }

  const tip = (user, top, margin, bottom) =>
    db.Tip.create({
      user: user._id, season: YEAR, round: 1,
      topEightSelection: top, marginTopEight: margin,
      bottomTenSelection: bottom, marginBottomTen: 0,
    });
  await tip(U.ann, "Adelaide", 15, "Richmond");
  await tip(U.bob, "Adelaide", 20, "Geelong");
  await tip(U.cat, "Adelaide", 20, "Geelong");
  await tip(U.dan, "Melbourne", 10, "Richmond");

  const pool = await db.League.create({
    name: "Delete Pool", slug: "delete-pool", type: "weekly", buyIn: 5,
    admin: U.ann._id, createdSeason: YEAR, startRound: 1,
  });
  for (const u of Object.values(U)) {
    await db.LeagueMembership.create({
      league: pool._id, user: u._id, joinedAtRound: 1, joinedAtSeason: YEAR,
    });
  }
  const solo = await db.League.create({
    name: "Dan Alone", slug: "dan-alone", type: "season",
    admin: U.dan._id, createdSeason: YEAR, startRound: 1,
  });
  await db.LeagueMembership.create({
    league: solo._id, user: U.dan._id, joinedAtRound: 1, joinedAtSeason: YEAR,
  });

  // Paid, the way the hourly job pays: the site pool on the tips, the weekly
  // pool in result rows. bob and cat split both.
  await results.calculateRound(YEAR, 1);
  await leagueRounds.scoreAllWeekly(YEAR);

  // Two devices signed in as cat, one as bob.
  const sessionFor = (id, user) => ({
    _id: id,
    expires: new Date(Date.now() + 86400000),
    session: JSON.stringify({ cookie: {}, passport: { user: String(user._id) } }),
  });
  await sessions().insertMany([
    sessionFor("cat-phone", U.cat), sessionFor("cat-laptop", U.cat), sessionFor("bob-phone", U.bob),
  ]);

  // -------------------------------------------------------------- the app
  let as = null;
  let destroyed = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => Boolean(as);
    if (as) req.user = { id: String(as._id), admin: false };
    req.session = { destroy: (cb) => { destroyed += 1; cb(); } };
    next();
  });
  require("./api-routes.js")(app);
  app.use("/api/leagues", require("./leagues"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  const deleteAs = async (user) => {
    as = user;
    const res = await fetch(`${base}/api/deleteUser`, { method: "DELETE" });
    return { status: res.status, body: await res.json() };
  };

  const siteWinnings = async (user) =>
    (await db.Tip.findOne({ user: user._id, season: YEAR, round: 1 }).lean())?.winnings;
  const poolWinnings = async (user) =>
    (await db.LeagueRoundResult.findOne({ league: pool._id, season: YEAR, round: 1, user: user._id }).lean())?.winnings;

  // ------------------------------------------------------------ the tests

  // The review's B21. ann runs the pool and three other people are in it.
  await t.test("somebody running a league with others in it is asked to hand it over", async () => {
    const before = destroyed;
    const res = await deleteAs(U.ann);

    assert.equal(res.status, 409);
    assert.match(res.body.message, /Delete Pool/);
    assert.match(res.body.message, /hand it/i);

    const ann = await db.User.findById(U.ann._id).lean();
    assert.equal(ann.email, "ann@delete.test", "nothing about the account changed");
    assert.equal(destroyed, before, "and they are still signed in to do the handing over");
    assert.equal(await db.LeagueMembership.countDocuments({ user: U.ann._id }), 1);
  });

  // The review's B22. cat won round 1 and then deletes; the hourly jobs run.
  await t.test("a player who was paid deletes, and the round stays as it was paid", async () => {
    assert.equal(await siteWinnings(U.bob), 2, "precondition: bob and cat split the site pool");
    assert.equal(await poolWinnings(U.bob), 2, "and the weekly pool");

    // A reset link cat asked for and never used, which must not outlive her.
    await db.User.updateOne(
      { _id: U.cat._id },
      { resetPassToken: "unused-link", tokenExpiration: new Date(Date.now() + 3600000) }
    );
    // And the app remembering who she is, as it does for a minute after any
    // signed-in request (services/sessionUsers.js).
    assert.ok(await sessionUsers.findSessionUser(U.cat._id));

    const res = await deleteAs(U.cat);
    assert.equal(res.status, 200);

    await results.calculateSeason(YEAR);
    await leagueRounds.scoreAllWeekly(YEAR);

    assert.equal(await siteWinnings(U.bob), 2, "bob's site-pool share is what he was paid");
    assert.equal(await poolWinnings(U.bob), 2, "and so is his weekly share");
    assert.equal(await poolWinnings(U.cat), 2, "cat's own row stands too");
    assert.ok(await db.Tip.exists({ user: U.cat._id }), "cat's tip is still there");
  });

  await t.test("nothing that identified them is left", async () => {
    const cat = await db.User.findById(U.cat._id)
      .select("+password +resetPassToken +tokenExpiration")
      .lean();

    assert.notEqual(cat.email, "cat@delete.test");
    assert.match(cat.email, /@deleted\.invalid$/);
    assert.equal(cat.firstName, "Former");
    assert.equal(cat.lastName, "player");
    assert.match(cat.username, /^Former player /);
    assert.notEqual(cat.password, "x", "the old password no longer opens it");
    assert.equal(cat.admin, false);
    assert.equal(cat.resetPassToken, undefined, "the unused reset link is dead");
    assert.equal(cat.tokenExpiration, undefined);
    assert.ok(cat.deletedAt instanceof Date);
  });

  // The username is what everyone else's tables show for them from now on.
  await t.test("and the tables show them as a former player", async () => {
    as = U.bob;
    const res = await fetch(`${base}/api/roundResult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: 1, season: YEAR }),
    });
    const rows = await res.json();
    const names = rows.map((r) => r.userDetail[0].username);

    assert.ok(names.some((n) => /^Former player /.test(n)));
    assert.equal(names.includes("del_cat"), false);
  });

  await t.test("they are out of every league, and their results stay", async () => {
    assert.equal(await db.LeagueMembership.countDocuments({ user: U.cat._id }), 0);
    assert.equal(await db.LeagueRoundResult.countDocuments({ user: U.cat._id }), 1);
  });

  await t.test("every device they were signed in on is signed out", async () => {
    const left = await sessions().find({}).toArray();
    assert.deepEqual(left.map((s) => s._id).sort(), ["bob-phone"]);
    assert.equal(
      await sessionUsers.findSessionUser(U.cat._id), null,
      "and nothing remembers her as signed in"
    );
  });

  await t.test("their old address can sign up again", async () => {
    await db.User.create({
      username: "cat_returns", email: "cat@delete.test", password: "x",
      firstName: "Cat", lastName: "Again", favTeam: 1,
    });
    assert.equal(await db.User.countDocuments({ email: "cat@delete.test" }), 1);
  });

  // The site's tables list every account, not a membership - and a deleted
  // account is still an account. It belongs in the rounds it played, as a
  // former player, and nowhere else: not as "no tip" in every round after it
  // left, and not in the count of who is registered.
  await t.test("the site's tables show a former player only where they played", async () => {
    const played = await globalLadder.roundDetail(YEAR, 1);
    const former = played.standings.filter((r) => /^Former player /.test(r.username));
    assert.equal(former.length, 1, "cat is in round 1, which she played");
    assert.equal(former[0].status, "entered");

    const after = await globalLadder.roundDetail(YEAR, 2);
    assert.equal(
      after.standings.some((r) => /^Former player /.test(r.username)), false,
      "and not sitting out round 2, which she never could"
    );

    // eve signed up, never tipped, and deletes.
    const eve = await db.User.create({
      username: "del_eve", email: "eve@delete.test", password: "x",
      firstName: "eve", lastName: "Deleter", favTeam: 1,
    });
    const before = (await globalLadder.get(YEAR)).registered;
    assert.equal((await deleteAs(eve)).status, 200);
    await db.GlobalLadder.deleteMany({});

    const ladder = await globalLadder.get(YEAR);
    assert.equal(ladder.registered, before - 1, "eve is no longer counted");
    assert.ok(
      ladder.standings.some((r) => /^Former player /.test(r.username)),
      "cat's round still counts on the ladder"
    );
  });

  // The stored ladder is only rebuilt when a round finishes, so it can hold a
  // row for somebody who deleted since. Read back, that row is dropped the
  // same way unless they played.
  await t.test("and a stored ladder taken before the deletion agrees", async () => {
    const fay = await db.User.create({
      username: "del_fay", email: "fay@delete.test", password: "x",
      firstName: "fay", lastName: "Deleter", favTeam: 1,
    });
    await db.GlobalLadder.deleteMany({});
    const before = (await globalLadder.get(YEAR)).registered;

    assert.equal((await deleteAs(fay)).status, 200);
    const cached = await globalLadder.get(YEAR);

    assert.equal(cached.rebuilt, false, "precondition: read from the stored ladder");
    assert.equal(cached.registered, before - 1);
  });

  // Nobody to hand to, so the league closes with the account - the same soft
  // delete the league's own delete route uses.
  await t.test("somebody running a league on their own can delete, and it closes", async () => {
    const res = await deleteAs(U.dan);

    assert.equal(res.status, 200);
    const closed = await db.League.findById(solo._id).lean();
    assert.ok(closed.deletedAt instanceof Date);
    const stillOpen = await db.League.findById(pool._id).lean();
    assert.equal(stillOpen.deletedAt, null, "the pool dan was only a member of is untouched");
  });
});

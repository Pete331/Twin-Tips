// A league from start to finish: made, joined, listed, ranked, run, left and
// closed.
//
// Found by measuring the server suite's coverage. Creating a league, closing
// one, the list of your leagues and the rankings Home is built from had no
// test at all, and nor did leaving or removing someone - the routes that
// decide who is in a pool. The settings, the invite preview and the round
// views are tested in their own files; this covers the rest.
//
// The real session, passport, auth and league routes against a real MongoDB,
// as in leagueSettings.route.test.js. The season is set by fixtures for a year
// nothing else uses, timed against the real clock, as in rounds.route.test.js.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const db = require("../models");
const passport = require("../config/passport");
const { sessionMiddleware } = require("../config/session");
const season = require("../services/season");

const URI =
  process.env.LEAGUES_ROUTE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-leagues-route";

const PASSWORD = "Passw0rd1";
const YEAR = 2089;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test("a league", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await db.User.init();
  await db.League.init();
  await db.LeagueMembership.init();

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(
    sessionMiddleware({
      client: mongoose.connection.getClient(),
      secret: "test secret",
      secure: false,
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use("/api/auth", require("./api/auth"));
  app.use("/api/leagues", require("./leagues"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  // Each request from its own address, so the create and join limits are
  // never what a case is measuring.
  let address = 0;
  const call = async (method, path, body, cookie) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `203.0.113.${(++address % 250) + 1}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const cookieOf = (res) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

  // Registering signs you in, so each person comes back with a session.
  const person = async (username) => {
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `203.0.113.${(++address % 250) + 1}`,
      },
      body: JSON.stringify({
        username,
        email: `${username}@leagues.test`,
        password: PASSWORD,
        firstName: "A",
        lastName: "Player",
      }),
    });
    assert.equal(res.status, 201);
    const user = await db.User.findOne({ username });
    return { id: String(user._id), cookie: cookieOf(res) };
  };

  // Round 1 played and round 2 next. bounceIn is how far off round 2's first
  // game is: ahead, it is open for tipping; behind, it has started.
  const seasonAt = async (bounceIn = 2 * DAY) => {
    await db.Fixture.deleteMany({});
    season.forgetFixtures();
    const now = Date.now();
    const game = (id, round, date, over = {}) => ({
      id,
      year: YEAR,
      round,
      roundname: `Round ${round}`,
      is_final: 0,
      date: new Date(date),
      complete: 0,
      hteam: "Carlton",
      hteamid: 3,
      ateam: "Richmond",
      ateamid: 14,
      ...over,
    });
    await db.Fixture.create([
      game(1, 1, now - 5 * DAY, {
        complete: 100,
        hscore: 90,
        ascore: 80,
        winner: "Carlton",
        winnerteamid: 3,
      }),
      game(2, 2, now + bounceIn),
      game(3, 2, now + 3 * DAY),
      game(4, 3, now + 9 * DAY),
    ]);
  };

  const clean = async () => {
    await Promise.all([
      db.User.deleteMany({}),
      db.League.deleteMany({}),
      db.LeagueMembership.deleteMany({}),
      db.Tip.deleteMany({}),
      db.GlobalLadder.deleteMany({}),
      mongoose.connection.collection("sessions").deleteMany({}),
    ]);
  };

  const create = (cookie, over = {}) =>
    call(
      "POST",
      "/api/leagues",
      { name: "Friday Night Footy", type: "weekly", buyIn: 10, ...over },
      cookie
    );

  await seasonAt();

  await t.test("creating one", async (t) => {
    await t.test("needs you signed in", async () => {
      await clean();
      const res = await create(null);

      assert.equal(res.status, 401);
      assert.equal(await db.League.countDocuments(), 0);
    });

    await t.test("needs a name, and not a long one", async () => {
      await clean();
      const zoe = await person("zoe");

      const none = await create(zoe.cookie, { name: "   " });
      const long = await create(zoe.cookie, { name: "x".repeat(61) });
      const sixty = await create(zoe.cookie, { name: "x".repeat(60) });

      assert.equal(none.status, 400);
      assert.equal(none.body.message, "Give the league a name.");
      assert.equal(long.status, 400);
      assert.equal(sixty.status, 201);
    });

    await t.test(
      "is scored per round or per season, nothing else",
      async () => {
        await clean();
        const zoe = await person("zoe");

        const res = await create(zoe.cookie, { type: "knockout" });

        assert.equal(res.status, 400);
        assert.equal(await db.League.countDocuments(), 0);
      }
    );

    // Fixed once set, so anything odd is refused now rather than discovered
    // in a pool a month later.
    await t.test("a pool's buy-in is whole dollars, 1 to 1000", async () => {
      await clean();
      const zoe = await person("zoe");

      for (const buyIn of [0, 1001, 2.5, "ten", undefined]) {
        const res = await create(zoe.cookie, { buyIn });
        assert.equal(res.status, 400, String(buyIn));
      }
      assert.equal((await create(zoe.cookie, { buyIn: 1 })).status, 201);
      assert.equal((await create(zoe.cookie, { buyIn: 1000 })).status, 201);
    });

    // A season ladder has no pool, so a stake sent for one is not stored to
    // turn up later looking like it meant something.
    await t.test("a season ladder keeps no buy-in", async () => {
      await clean();
      const zoe = await person("zoe");

      const res = await create(zoe.cookie, { type: "season", buyIn: 50 });

      assert.equal(res.status, 201);
      assert.equal(res.body.buyIn, undefined);
      assert.equal((await db.League.findOne()).buyIn, undefined);
    });

    await t.test("makes you its admin and its first member", async () => {
      await clean();
      const zoe = await person("zoe");

      const res = await create(zoe.cookie);
      const league = await db.League.findOne({ slug: res.body.slug });
      const membership = await db.LeagueMembership.findOne({
        league: league._id,
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.isAdmin, true);
      assert.equal(String(league.admin), zoe.id);
      assert.equal(String(membership.user), zoe.id);
      assert.ok(res.body.invite.token);
      assert.ok(res.body.invite.code);
    });

    // A league made mid-round must not claim tips entered before it existed.
    await t.test("scoring from the round still open", async () => {
      await clean();
      const zoe = await person("zoe");

      const res = await create(zoe.cookie);
      const membership = await db.LeagueMembership.findOne();

      assert.equal(res.body.createdSeason, YEAR);
      assert.equal(res.body.startRound, 2);
      assert.equal(membership.joinedAtRound, 2);
      assert.equal(membership.joinedAtSeason, YEAR);
    });

    await t.test("or the one after, once that round has started", async () => {
      await clean();
      await seasonAt(-HOUR);
      const zoe = await person("zoe");

      const res = await create(zoe.cookie);

      assert.equal(res.body.startRound, 3);
      await seasonAt();
    });

    // A slug is an address. Two leagues of the same name still get two.
    await t.test("two of the same name are two leagues", async () => {
      await clean();
      const zoe = await person("zoe");

      const first = await create(zoe.cookie);
      const second = await create(zoe.cookie);

      assert.equal(second.status, 201);
      assert.notEqual(first.body.slug, second.body.slug);
      assert.match(first.body.slug, /^friday-night-footy-/);
    });
  });

  // A league run by zoe with pete in it, and a second league of zoe's that
  // pete is not in.
  const twoLeagues = async () => {
    await clean();
    const zoe = await person("zoe");
    const pete = await person("pete");
    const pool = (await create(zoe.cookie)).body;
    const ladder = (
      await create(zoe.cookie, { name: "The Long Game", type: "season" })
    ).body;
    const join = await call(
      "POST",
      "/api/leagues/join",
      { token: pool.invite.token },
      pete.cookie
    );
    assert.equal(join.status, 200);
    return { zoe, pete, pool, ladder };
  };

  await t.test("reading one", async (t) => {
    // Trying slugs must tell you nothing, so one you are not in answers
    // exactly as one that does not exist.
    await t.test("not being in it is the same as it not existing", async () => {
      const { pete, ladder } = await twoLeagues();

      const notIn = await call(
        "GET",
        `/api/leagues/${ladder.slug}`,
        null,
        pete.cookie
      );
      const nowhere = await call(
        "GET",
        "/api/leagues/no-such-league",
        null,
        pete.cookie
      );

      assert.equal(notIn.status, 404);
      assert.deepEqual(notIn.body, nowhere.body);
    });

    await t.test("a round has to be a number", async () => {
      const { pete, pool } = await twoLeagues();

      const everywhere = await call(
        "GET",
        "/api/leagues/rounds/latest",
        null,
        pete.cookie
      );
      const one = await call(
        "GET",
        `/api/leagues/${pool.slug}/rounds/latest`,
        null,
        pete.cookie
      );

      assert.equal(everywhere.status, 400);
      assert.equal(one.status, 400);
    });
  });

  await t.test("joining one", async (t) => {
    await t.test("needs a link or a code", async () => {
      const { pete } = await twoLeagues();
      const res = await call("POST", "/api/leagues/join", {}, pete.cookie);

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Enter an invite link or code.");
    });

    await t.test("one that points somewhere", async () => {
      const { pete } = await twoLeagues();
      const res = await call(
        "POST",
        "/api/leagues/join",
        { token: "nope" },
        pete.cookie
      );

      assert.equal(res.status, 404);
    });

    await t.test("by code, typed any old way", async () => {
      const { pete, ladder } = await twoLeagues();

      const res = await call(
        "POST",
        "/api/leagues/join",
        { code: ladder.invite.code.toLowerCase().replace("-", " ") },
        pete.cookie
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.slug, ladder.slug);
    });

    // Codes are short and not unique. Two live leagues sharing one is no
    // match, rather than a guess at which was meant.
    await t.test("a code two leagues share joins neither", async () => {
      const { pete, pool, ladder } = await twoLeagues();
      await db.League.updateOne(
        { slug: ladder.slug },
        { $set: { joinCode: pool.invite.code } }
      );
      await db.LeagueMembership.deleteMany({ user: pete.id });

      const res = await call(
        "POST",
        "/api/leagues/join",
        { code: pool.invite.code },
        pete.cookie
      );

      assert.equal(res.status, 404);
      assert.equal(
        await db.LeagueMembership.countDocuments({ user: pete.id }),
        0
      );
    });

    // Opening the same link twice is not an error, and is not two members.
    await t.test("twice is still once", async () => {
      const { pete, pool } = await twoLeagues();

      const again = await call(
        "POST",
        "/api/leagues/join",
        { token: pool.invite.token },
        pete.cookie
      );

      assert.equal(again.status, 200);
      assert.equal(again.body.alreadyMember, true);
      assert.equal(
        await db.LeagueMembership.countDocuments({ user: pete.id }),
        1
      );
    });
  });

  await t.test("your leagues", async (t) => {
    await t.test(
      "are the ones you are in, in the order you joined",
      async () => {
        const { zoe, pete, pool, ladder } = await twoLeagues();

        const zoes = await call("GET", "/api/leagues/mine", null, zoe.cookie);
        const petes = await call("GET", "/api/leagues/mine", null, pete.cookie);

        assert.deepEqual(
          zoes.body.leagues.map((l) => [l.slug, l.isAdmin]),
          [
            [pool.slug, true],
            [ladder.slug, true],
          ]
        );
        assert.deepEqual(
          petes.body.leagues.map((l) => [l.slug, l.isAdmin]),
          [[pool.slug, false]]
        );
      }
    );

    await t.test("signed out, there are none to list", async () => {
      await twoLeagues();
      const res = await call("GET", "/api/leagues/mine");
      assert.equal(res.status, 401);
    });
  });

  await t.test("where you stand", async (t) => {
    const rankings = (cookie) =>
      call("GET", `/api/leagues/rankings?season=${YEAR}`, null, cookie);

    // Pools first, then ladders, then the site ladder - which everyone is
    // in, league or not.
    await t.test("pools, then ladders, then the site", async () => {
      const { zoe, pool, ladder } = await twoLeagues();
      // Joined in the other order, so the sort is what puts the pool first.
      await db.LeagueMembership.updateOne(
        {
          user: zoe.id,
          league: (await db.League.findOne({ slug: pool.slug }))._id,
        },
        { $set: { joinedAt: new Date(Date.now() + DAY) } }
      );

      const res = await rankings(zoe.cookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.season, YEAR);
      assert.deepEqual(
        res.body.rankings.map((r) => [r.type, r.slug]),
        [
          ["weekly", pool.slug],
          ["season", ladder.slug],
          ["global", null],
        ]
      );
      assert.equal(res.body.rankings[2].name, "Overall Site Ladder");
    });

    // A place is relative to everyone else in that league.
    await t.test("your place and out of how many", async () => {
      const { zoe, pete, ladder } = await twoLeagues();
      await call(
        "POST",
        "/api/leagues/join",
        { token: ladder.invite.token },
        pete.cookie
      );
      // The ladder started scoring at round 2, so make round 2 played.
      await db.Fixture.updateMany(
        { year: YEAR, round: 2 },
        { $set: { complete: 100, date: new Date(Date.now() - DAY) } }
      );
      season.forgetFixtures();
      await db.Tip.create([
        { user: zoe.id, season: YEAR, round: 2, correctTips: 2 },
        { user: pete.id, season: YEAR, round: 2, correctTips: 1 },
      ]);

      const zoes = (await rankings(zoe.cookie)).body.rankings;
      const petes = (await rankings(pete.cookie)).body.rankings;
      const inLadder = (list) => list.find((r) => r.slug === ladder.slug);

      assert.deepEqual(
        [inLadder(zoes).rank, inLadder(zoes).of, inLadder(zoes).tied],
        [1, 2, false]
      );
      assert.deepEqual([inLadder(petes).rank, inLadder(petes).of], [2, 2]);
      await seasonAt();
    });

    // A league you are not in is not a ranking you have.
    await t.test("only for leagues you are in", async () => {
      const { pete, ladder } = await twoLeagues();

      const slugs = (await rankings(pete.cookie)).body.rankings.map(
        (r) => r.slug
      );

      assert.ok(!slugs.includes(ladder.slug));
    });
  });

  await t.test("running one", async (t) => {
    const patch = (cookie, slug, body) =>
      call("PATCH", `/api/leagues/${slug}`, body, cookie);

    await t.test("only its admin changes it", async () => {
      const { pete, pool } = await twoLeagues();
      const res = await patch(pete.cookie, pool.slug, { name: "Mine now" });

      assert.equal(res.status, 403);
      assert.equal(res.body.message, "Only the league admin can do that.");
    });

    // Every past round was scored against them, so they are refused rather
    // than quietly ignored.
    await t.test("the buy-in and the scoring are fixed", async () => {
      const { zoe, pool } = await twoLeagues();

      // Each with a rename beside it, so being refused is told apart from
      // being ignored: ignored, the rename would go through.
      const buyIn = await patch(zoe.cookie, pool.slug, {
        buyIn: 20,
        name: "Renamed",
      });
      const type = await patch(zoe.cookie, pool.slug, {
        type: "season",
        name: "Renamed",
      });

      assert.equal(buyIn.status, 400);
      assert.match(buyIn.body.message, /buy-in is fixed/);
      assert.equal(type.status, 400);
      assert.match(type.body.message, /scoring cannot change/);
      const league = await db.League.findOne({ slug: pool.slug });
      assert.deepEqual(
        [league.buyIn, league.type, league.name],
        [10, "weekly", "Friday Night Footy"]
      );
    });

    // The slug stays: every invite link already shared points at it.
    await t.test("renaming keeps the address", async () => {
      const { zoe, pool } = await twoLeagues();

      const blank = await patch(zoe.cookie, pool.slug, { name: "  " });
      const res = await patch(zoe.cookie, pool.slug, { name: "Thursday Tips" });

      assert.equal(blank.status, 400);
      assert.equal(res.status, 200);
      assert.equal(res.body.name, "Thursday Tips");
      assert.equal(res.body.slug, pool.slug);
    });

    await t.test("handing it on goes only to a member", async () => {
      const { zoe, pool } = await twoLeagues();
      const outsider = await person("sam");

      const notMember = await patch(zoe.cookie, pool.slug, {
        admin: outsider.id,
      });
      const notAnId = await patch(zoe.cookie, pool.slug, { admin: "pete" });

      assert.equal(notMember.status, 400);
      assert.equal(notAnId.status, 400);
      const league = await db.League.findOne({ slug: pool.slug });
      assert.equal(String(league.admin), zoe.id);
    });

    // How a removed member is kept out, and a link shared too widely taken
    // back.
    await t.test("a new invite stops the old one working", async () => {
      const { zoe, pool } = await twoLeagues();
      const late = await person("sam");

      const res = await patch(zoe.cookie, pool.slug, {
        regenerateInvite: true,
      });
      const oldLink = await call(
        "POST",
        "/api/leagues/join",
        { token: pool.invite.token },
        late.cookie
      );
      const newLink = await call(
        "POST",
        "/api/leagues/join",
        { token: res.body.invite.token },
        late.cookie
      );

      assert.equal(res.status, 200);
      assert.notEqual(res.body.invite.token, pool.invite.token);
      assert.notEqual(res.body.invite.code, pool.invite.code);
      assert.equal(oldLink.status, 404);
      assert.equal(newLink.status, 200);
    });

    await t.test("asking to change nothing says so", async () => {
      const { zoe, pool } = await twoLeagues();
      const res = await patch(zoe.cookie, pool.slug, {});

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Nothing to change.");
    });
  });

  await t.test("leaving and removing", async (t) => {
    const remove = (cookie, slug, userId) =>
      call("DELETE", `/api/leagues/${slug}/members/${userId}`, null, cookie);

    await t.test("a member can leave", async () => {
      const { pete, pool } = await twoLeagues();

      const res = await remove(pete.cookie, pool.slug, pete.id);
      const after = await call(
        "GET",
        `/api/leagues/${pool.slug}`,
        null,
        pete.cookie
      );

      assert.equal(res.status, 200);
      assert.match(res.body.message, /^You have left Friday Night Footy/);
      assert.equal(after.status, 404);
    });

    await t.test("but not remove anybody else", async () => {
      const { zoe, pete, pool } = await twoLeagues();

      const res = await remove(pete.cookie, pool.slug, zoe.id);

      assert.equal(res.status, 403);
      assert.equal(
        await db.LeagueMembership.countDocuments({ user: zoe.id }),
        2
      );
    });

    await t.test("the admin can remove a member", async () => {
      const { zoe, pete, pool } = await twoLeagues();

      const res = await remove(zoe.cookie, pool.slug, pete.id);

      assert.equal(res.status, 200);
      assert.equal(res.body.message, "Member removed.");
      assert.equal(
        await db.LeagueMembership.countDocuments({ user: pete.id }),
        0
      );
    });

    // A league without an admin cannot be run, so it is handed on first.
    await t.test("the admin cannot leave without handing it on", async () => {
      const { zoe, pool } = await twoLeagues();

      const res = await remove(zoe.cookie, pool.slug, zoe.id);

      assert.equal(res.status, 400);
      assert.equal(
        await db.LeagueMembership.countDocuments({ user: zoe.id }),
        2
      );
    });

    await t.test("removing someone not in it says so", async () => {
      const { zoe, pool } = await twoLeagues();
      const outsider = await person("sam");

      const res = await remove(zoe.cookie, pool.slug, outsider.id);

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "They are not in this league.");
    });
  });

  await t.test("closing one", async (t) => {
    const close = (cookie, slug) =>
      call("DELETE", `/api/leagues/${slug}`, null, cookie);

    await t.test("only its admin can", async () => {
      const { pete, pool } = await twoLeagues();

      const res = await close(pete.cookie, pool.slug);

      assert.equal(res.status, 403);
      assert.equal(
        (await db.League.findOne({ slug: pool.slug })).deletedAt,
        null
      );
    });

    await t.test("and not from outside it", async () => {
      const { pete, ladder } = await twoLeagues();

      const res = await close(pete.cookie, ladder.slug);

      assert.equal(res.status, 404);
    });

    // Closed to everything - reading, listing, ranking and joining - but
    // kept, because its members' history is in it.
    await t.test("then it is gone from every view, and kept", async () => {
      const { zoe, pete, pool } = await twoLeagues();
      const late = await person("sam");

      const res = await close(zoe.cookie, pool.slug);

      assert.equal(res.status, 200);
      assert.equal(res.body.message, "Friday Night Footy has been closed.");

      const read = await call(
        "GET",
        `/api/leagues/${pool.slug}`,
        null,
        pete.cookie
      );
      const mine = await call("GET", "/api/leagues/mine", null, pete.cookie);
      const ranked = await call(
        "GET",
        `/api/leagues/rankings?season=${YEAR}`,
        null,
        pete.cookie
      );
      const join = await call(
        "POST",
        "/api/leagues/join",
        { token: pool.invite.token },
        late.cookie
      );

      assert.equal(read.status, 404);
      assert.deepEqual(mine.body.leagues, []);
      assert.ok(!ranked.body.rankings.some((r) => r.slug === pool.slug));
      assert.equal(join.status, 404);

      const kept = await db.League.findOne({ slug: pool.slug });
      assert.ok(kept.deletedAt instanceof Date);
      assert.equal(
        await db.LeagueMembership.countDocuments({ league: kept._id }),
        2
      );
    });
  });
});

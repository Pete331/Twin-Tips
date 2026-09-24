// Fixtures Squiggle has stopped serving, and the limit on removing them.
//
// The sync only ever added. A game Squiggle dropped or renumbered stayed in
// the collection, and because the unique index on id stops the same game being
// stored twice, the leftover necessarily carries a different id - so it sits
// beside the real fixture rather than replacing it, and the round draws both.
// That is how a Grand Final came to appear twice on the production site.
//
// The removal is the easy half. The half worth testing is the refusal: this
// deletes fixtures, and the payload it deletes against comes over the network
// from somebody else's server. A short answer from Squiggle - an outage, a
// half-written response, a season they have started rebuilding - must not be
// read as "the season shrank", because acting on that empties the collection
// the whole app is built on.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const db = require("../models");

const URI =
  process.env.SYNC_TEST_URI || "mongodb://localhost/twin-tips-test-prune";
const YEAR = 2095;

// Squiggle's shape. Ids ascend from the base so a payload of any size can be
// asked for without writing them out.
const game = (id, over) => ({
  id,
  year: YEAR,
  round: 1,
  roundname: "Round 1",
  venue: "Test Oval",
  hteam: "Adelaide",
  hteamid: 1,
  ateam: "Melbourne",
  ateamid: 11,
  complete: 0,
  is_final: 0,
  unixtime: Date.UTC(2095, 2, 5, 8, 30) / 1000,
  ...over,
});

const season = (count, from = 870001) =>
  Array.from({ length: count }, (_, i) => game(from + i));

test("syncGames and fixtures Squiggle has dropped", async (t) => {
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

  const realFetch = global.fetch;
  const realWarn = console.warn;

  const serve = (games) => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ games }),
    });
  };

  // Required after stubbing fetch so the squiggle client picks it up, and so
  // its response cache does not carry between cases.
  const freshSync = () => {
    delete require.cache[require.resolve("./squiggle")];
    delete require.cache[require.resolve("./seasonSync")];
    return require("./seasonSync");
  };

  // The warnings are part of the behaviour - a refusal nobody can see is a
  // silent one - so they are captured rather than left to clutter the run.
  const runQuietly = async (fn) => {
    const said = [];
    console.warn = (...args) => said.push(args.join(" "));
    try {
      return { result: await fn(), said };
    } finally {
      console.warn = realWarn;
    }
  };

  const ids = async () =>
    (await db.Fixture.find({ year: YEAR }).select("id").lean())
      .map((f) => f.id)
      .sort((a, b) => a - b);

  await t.test("a fixture Squiggle no longer serves is removed", async () => {
    await db.Fixture.deleteMany({});
    serve(season(10));
    await freshSync().syncGames(YEAR);

    // Squiggle renumbers one of them, which is what happened to the finals
    // bracket: the old id vanishes and a new one appears in its place.
    const next = season(10);
    next[3] = game(879999, { roundname: "Grand Final" });
    serve(next);

    const { result } = await runQuietly(() => freshSync().syncGames(YEAR));

    assert.equal(result.removed, 1, "the id Squiggle dropped should be gone");
    assert.equal(result.count, 10);
    assert.deepEqual(
      await ids(),
      [
        870001, 870002, 870003, 870005, 870006, 870007, 870008, 870009, 870010,
        879999,
      ]
    );
  });

  // A full season, not two games: dropping one of two is a half-empty payload,
  // which the floor below refuses - correctly - and then there is nothing to
  // report. The removal being audible only matters on a payload it trusts.
  await t.test("and it says which one, by id and by match", async () => {
    await db.Fixture.deleteMany({});
    const before = season(20);
    before[7] = game(870008, { hteam: "Fremantle", ateam: "Brisbane Lions" });
    serve(before);
    await freshSync().syncGames(YEAR);

    serve(season(20).filter((g) => g.id !== 870008));
    const { said } = await runQuietly(() => freshSync().syncGames(YEAR));

    const line = said.find((s) => s.includes("870008"));
    assert.ok(line, "the removed fixture should be named");
    assert.match(line, /Fremantle/);
    assert.match(line, /Brisbane Lions/);
  });

  await t.test("a season that has not changed removes nothing", async () => {
    await db.Fixture.deleteMany({});
    serve(season(10));
    await freshSync().syncGames(YEAR);

    serve(season(10));
    const { result } = await runQuietly(() => freshSync().syncGames(YEAR));

    assert.equal(result.removed, 0);
    assert.equal((await ids()).length, 10);
  });

  // The case this file exists for.
  await t.test(
    "a payload far short of what is stored removes nothing",
    async () => {
      await db.Fixture.deleteMany({});
      serve(season(20));
      await freshSync().syncGames(YEAR);

      // Squiggle answers with one game instead of twenty. Nineteen of the
      // fixtures the app runs on are still real.
      serve(season(1));
      const { result, said } = await runQuietly(() =>
        freshSync().syncGames(YEAR)
      );

      assert.equal(
        result.removed,
        0,
        "a short payload must not empty the season"
      );
      assert.equal((await ids()).length, 20, "every fixture is still there");
      assert.ok(
        said.some((s) => s.includes("too far short")),
        "and the refusal is said out loud"
      );
    }
  );

  // The boundary, from both sides, so the floor cannot drift unnoticed.
  await t.test("the floor is where it says it is", async () => {
    await db.Fixture.deleteMany({});
    serve(season(20));
    await freshSync().syncGames(YEAR);

    // 18 of 20 is exactly the floor, and prunes.
    serve(season(18));
    const { result: atFloor } = await runQuietly(() =>
      freshSync().syncGames(YEAR)
    );
    assert.equal(atFloor.removed, 2, "at the floor the removal goes ahead");

    await db.Fixture.deleteMany({});
    serve(season(20));
    await freshSync().syncGames(YEAR);

    // 17 of 20 is under it, and does not.
    serve(season(17));
    const { result: below } = await runQuietly(() =>
      freshSync().syncGames(YEAR)
    );
    assert.equal(below.removed, 0, "a step under the floor refuses");
    assert.equal((await ids()).length, 20);
  });

  // Twenty games rather than a handful, and deliberately so. One missing id out
  // of five is already short enough for the floor to refuse on its own, which
  // makes the id check untestable at that size - the case passes either way.
  // At twenty, nineteen live ids clears the floor comfortably, so the only
  // thing standing between a real fixture and deletion is the id check itself.
  await t.test("a game with no id refuses rather than guessing", async () => {
    await db.Fixture.deleteMany({});
    serve(season(20));
    await freshSync().syncGames(YEAR);

    // The same twenty games, one of them missing the field the whole
    // comparison rests on. Its fixture is still real; it just cannot be named.
    const malformed = season(20);
    delete malformed[2].id;
    serve(malformed);

    const { result, said } = await runQuietly(() =>
      freshSync().syncGames(YEAR)
    );

    assert.equal(result.removed, 0);
    assert.equal((await ids()).length, 20, "no fixture is deleted");
    assert.ok(
      await db.Fixture.findOne({ id: 870003 }),
      "least of all the one whose id went missing from the payload"
    );
    assert.ok(said.some((s) => s.includes("no id")));
  });

  // Seasons are pruned one at a time. A sync of 2095 has no business deciding
  // what 2094 should contain, and asks Squiggle nothing about it.
  await t.test("another season is left alone", async () => {
    await db.Fixture.deleteMany({});
    await db.Fixture.create({ year: YEAR - 1, round: 1, id: 860001 });
    serve(season(3));
    await freshSync().syncGames(YEAR);

    serve(season(3));
    const { result } = await runQuietly(() => freshSync().syncGames(YEAR));

    assert.equal(result.removed, 0);
    assert.ok(
      await db.Fixture.findOne({ id: 860001 }),
      "last season's fixture is not this sync's business"
    );
  });

  global.fetch = realFetch;
  console.warn = realWarn;
  await db.Fixture.deleteMany({});
});

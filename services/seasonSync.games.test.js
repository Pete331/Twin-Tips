// What syncGames actually stores for a fixture's kick-off.
//
// Every deadline in this app is a comparison against that one value, and
// Squiggle sends it three ways: `unixtime`, an unambiguous instant; `date`, a
// bare local-time string with no zone on it; and `tz`, the venue's offset.
// Letting the bare string reach Mongoose casts it in whatever zone the process
// happens to run in - two hours out in Perth, ten on a UTC host - so the stored
// kick-off would depend on where the code was running.
//
// fixtureDate has always chosen correctly. What this covers is the write around
// it, which used to spread Squiggle's whole payload - the bare string included -
// and only overwrite the date when fixtureDate returned something.
//
// Runs against its own database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const db = require("../models");

const URI =
  process.env.SYNC_TEST_URI || "mongodb://localhost/twin-tips-test-sync";
const YEAR = 2096;

// Squiggle's shape, with whichever time fields the case is about.
const game = (over) => ({
  id: 880001,
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
  ...over,
});

test("syncGames stores the kick-off", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);

  // Registered here rather than as a trailing statement, so it runs whether
  // these pass, fail or throw. As the last line of the test body it only ran on
  // the happy path, and one failure left the test database behind.
  //
  // Disconnected before the drop, and dropped with a client of our own.
  // mongoose builds indexes lazily and recreates the collections it knows about
  // the moment after a database is dropped, so dropping while still connected
  // leaves an empty database standing rather than none at all - which is
  // exactly what was found sitting on this machine.
  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;

    await mongoose.disconnect();

    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

  const realFetch = global.fetch;
  const serve = (games) => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ games }),
    });
  };

  // Required after stubbing fetch so the squiggle client picks it up, and its
  // response cache does not carry between cases.
  const freshSync = () => {
    delete require.cache[require.resolve("./squiggle")];
    delete require.cache[require.resolve("./seasonSync")];
    return require("./seasonSync");
  };

  const stored = () => db.Fixture.findOne({ id: 880001 }).lean();

  await t.test("unixtime is what gets stored", async () => {
    await db.Fixture.deleteMany({});
    // 2096-03-05 19:30 at a +11:00 venue.
    const instant = Date.UTC(2096, 2, 5, 8, 30) / 1000;
    serve([game({ unixtime: instant, date: "2096-03-05 19:30:00", tz: "+11:00" })]);

    await freshSync().syncGames(YEAR);

    const f = await stored();
    assert.equal(f.date.toISOString(), new Date(instant * 1000).toISOString());
  });

  await t.test("without unixtime, the local time plus the venue offset", async () => {
    await db.Fixture.deleteMany({});
    serve([game({ date: "2096-03-05 19:30:00", tz: "+11:00" })]);

    await freshSync().syncGames(YEAR);

    const f = await stored();
    assert.equal(f.date.toISOString(), "2096-03-05T08:30:00.000Z");
  });

  // The case this file exists for. With neither field there is no instant to be
  // had, and the honest answer is no date - not the bare string parsed in the
  // server's own zone, which is a different kick-off on every host.
  await t.test("with neither, no date is stored rather than a guessed one", async () => {
    await db.Fixture.deleteMany({});
    serve([game({ date: "2096-03-05 19:30:00" })]);

    await freshSync().syncGames(YEAR);

    const f = await stored();
    assert.equal(f.date, undefined, "a bare local string must not become the kick-off");
    assert.equal(f.hteam, "Adelaide", "the rest of the fixture is still written");
  });

  // A round of the local string not surviving as a string, either: the schema
  // types date as a Date, so anything that got through would be silently cast.
  await t.test("the raw Squiggle date string is never written", async () => {
    await db.Fixture.deleteMany({});
    serve([game({ date: "2096-03-05 19:30:00" })]);

    await freshSync().syncGames(YEAR);

    const raw = await mongoose.connection.db
      .collection("fixtures")
      .findOne({ id: 880001 });
    assert.equal(
      typeof raw.date === "string",
      false,
      "nothing should have stored the unparsed string"
    );
  });

  await t.test("an existing kick-off is not wiped by a payload without one", async () => {
    await db.Fixture.deleteMany({});
    serve([game({ unixtime: Date.UTC(2096, 2, 5, 8, 30) / 1000 })]);
    await freshSync().syncGames(YEAR);
    const first = (await stored()).date;

    // A later sync where Squiggle has dropped the time fields.
    serve([game({ complete: 100 })]);
    await freshSync().syncGames(YEAR);

    const after = await stored();
    assert.equal(after.date.toISOString(), first.toISOString(), "the known kick-off stands");
    assert.equal(after.complete, 100, "and the rest of the update still applies");
  });

  global.fetch = realFetch;
  await db.Fixture.deleteMany({});
});

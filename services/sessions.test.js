const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { endOtherSessions, isObjectIdString } = require("./sessions");

const URI =
  process.env.SESSIONS_TEST_URI || "mongodb://localhost/twin-tips-test-sessions";

// A stored session, in the shape connect-mongo writes: the whole thing as a
// JSON string in one field, which is why the user cannot simply be queried on.
const stored = (sid, userId) => ({
  _id: sid,
  expires: new Date(Date.now() + 86400e3),
  session: JSON.stringify({
    cookie: { originalMaxAge: 2592000000, httpOnly: true, sameSite: "lax" },
    passport: userId ? { user: userId } : {},
  }),
});

test("isObjectIdString only accepts what an ObjectId looks like", () => {
  assert.equal(isObjectIdString("6a9ab45b8a5d691bd7cccb86"), true);
  assert.equal(isObjectIdString("6A9AB45B8A5D691BD7CCCB86"), true);
  assert.equal(isObjectIdString("nope"), false);
  assert.equal(isObjectIdString(""), false);
  assert.equal(isObjectIdString(null), false);
  // Anything that could steer the regular expression it is interpolated into.
  assert.equal(isObjectIdString(".*"), false);
  assert.equal(isObjectIdString("6a9ab45b8a5d691bd7cccb86|x"), false);
});

test("endOtherSessions", async (t) => {
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

  const sessions = () => mongoose.connection.db.collection("sessions");
  const ALICE = "6a9ab45b8a5d691bd7cccb86";
  const BOB = "6a9ab45b8a5d691bd7cccb99";

  const reset = async () => {
    await sessions().deleteMany({});
    await sessions().insertMany([
      stored("alice-laptop", ALICE),
      stored("alice-phone", ALICE),
      stored("alice-tablet", ALICE),
      stored("bob-laptop", BOB),
      stored("anonymous", null),
    ]);
  };

  const remaining = async () =>
    (await sessions().find({}).toArray()).map((r) => r._id).sort();

  await t.test("keeps the session that asked, ends the rest", async () => {
    await reset();
    const { ended } = await endOtherSessions(ALICE, "alice-laptop");

    assert.equal(ended, 2);
    assert.deepEqual(await remaining(), ["alice-laptop", "anonymous", "bob-laptop"]);
  });

  // A reset happens signed out, so there is no session of theirs to preserve.
  await t.test("with nothing to keep, every session goes", async () => {
    await reset();
    const { ended } = await endOtherSessions(ALICE);

    assert.equal(ended, 3);
    assert.deepEqual(await remaining(), ["anonymous", "bob-laptop"]);
  });

  await t.test("nobody else's sessions are touched", async () => {
    await reset();
    await endOtherSessions(ALICE);

    const bob = await sessions().findOne({ _id: "bob-laptop" });
    assert.ok(bob, "Bob is still signed in");
    assert.equal(JSON.parse(bob.session).passport.user, BOB);
  });

  await t.test("a user with no sessions is not an error", async () => {
    await reset();
    const { ended } = await endOtherSessions("6a9ab45b8a5d691bd7ccc000");
    assert.equal(ended, 0);
  });

  // The regex narrows the scan; the parse is what decides. A session whose JSON
  // happens to contain the id somewhere other than passport.user must survive.
  await t.test("a coincidental match is not enough to delete a session", async () => {
    await sessions().deleteMany({});
    await sessions().insertOne({
      _id: "someone-else",
      expires: new Date(Date.now() + 86400e3),
      session: JSON.stringify({
        cookie: {},
        passport: { user: BOB },
        // The id appears, but not as this session's user.
        lastViewedProfile: `"user":"${ALICE}"`,
      }),
    });

    const { ended } = await endOtherSessions(ALICE);
    assert.equal(ended, 0);
    assert.ok(await sessions().findOne({ _id: "someone-else" }));
  });

  await t.test("a malformed session is left alone rather than throwing", async () => {
    await sessions().deleteMany({});
    await sessions().insertOne({
      _id: "corrupt",
      expires: new Date(Date.now() + 86400e3),
      session: `{"passport":{"user":"${ALICE}"` , // truncated JSON
    });

    const { ended } = await endOtherSessions(ALICE);
    assert.equal(ended, 0);
  });

  await t.test("something that is not a user id does nothing at all", async () => {
    await reset();
    const result = await endOtherSessions("not-an-id");
    assert.equal(result.ended, 0);
    assert.equal((await remaining()).length, 5, "no session may be removed");
  });

  await sessions().deleteMany({});
});

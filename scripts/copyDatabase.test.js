// The database copy used to move production between clusters.
//
// Copies between two throwaway local databases, seeded with the awkward parts
// of the real one: a unique index with a collation (usernames), a TTL index
// (sessions), and more documents than one insert batch.

const test = require("node:test");
const assert = require("node:assert/strict");
const { MongoClient } = require("mongodb");

const { copyDatabase, databaseOf, describe } = require("./copyDatabase");

const SOURCE =
  process.env.COPY_SOURCE_TEST_URI ||
  "mongodb://localhost/twin-tips-test-copy-source";
const TARGET =
  process.env.COPY_TARGET_TEST_URI ||
  "mongodb://localhost/twin-tips-test-copy-target";

const quiet = () => {};

test("the URI checks", () => {
  assert.equal(
    databaseOf(
      "mongodb+srv://u:p@cluster0.abc.mongodb.net/twin-tips?retryWrites=true"
    ),
    "twin-tips"
  );
  assert.equal(
    databaseOf("mongodb+srv://u:p@cluster0.abc.mongodb.net/?retryWrites=true"),
    null,
    "no name"
  );
  assert.equal(databaseOf("mongodb+srv://u:p@cluster0.abc.mongodb.net"), null);
  assert.equal(
    databaseOf("mongodb://localhost/test"),
    null,
    "the driver's default is no name at all"
  );

  // The password never reaches the output.
  assert.equal(
    describe(
      "mongodb+srv://pete:s3cret@cluster0.abc.mongodb.net/twin-tips?x=1"
    ),
    "cluster0.abc.mongodb.net/twin-tips"
  );
});

test("copying a database", async (t) => {
  let client;
  try {
    client = await MongoClient.connect("mongodb://localhost", {
      serverSelectionTimeoutMS: 1500,
    });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  const from = client.db(databaseOf(SOURCE));
  const to = client.db(databaseOf(TARGET));
  const reset = async () => {
    await from.dropDatabase();
    await to.dropDatabase();
  };
  t.after(async () => {
    await reset();
    await client.close();
  });

  const seed = async () => {
    await reset();
    await from
      .collection("users")
      .createIndex(
        { username: 1 },
        { unique: true, collation: { locale: "en", strength: 2 } }
      );
    await from.collection("users").insertMany([
      { username: "PeteB", email: "pete@example.test" },
      { username: "ann", email: "ann@example.test" },
    ]);
    await from
      .collection("sessions")
      .createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
    await from
      .collection("sessions")
      .insertOne({ _id: "abc", expires: new Date(Date.now() + 86400000) });
    await from
      .collection("tips")
      .insertMany(
        Array.from({ length: 2500 }, (_, i) => ({ round: i % 24, n: i }))
      );
  };

  await t.test(
    "without --copy it says what it would copy and writes nothing",
    async () => {
      await seed();
      const lines = [];

      const result = await copyDatabase({
        sourceUri: SOURCE,
        targetUri: TARGET,
        log: (l) => lines.push(l),
      });

      assert.equal(result.copied, false);
      assert.deepEqual(
        result.report.map((r) => [r.name, r.count]),
        [
          ["sessions", 1],
          ["tips", 2500],
          ["users", 2],
        ]
      );
      assert.deepEqual(
        await to.listCollections().toArray(),
        [],
        "nothing created"
      );
    }
  );

  await t.test(
    "with --copy every document and index comes across",
    async () => {
      await seed();

      const result = await copyDatabase({
        sourceUri: SOURCE,
        targetUri: TARGET,
        copy: true,
        log: quiet,
      });

      assert.equal(result.copied, true);
      assert.equal(
        await to.collection("tips").countDocuments(),
        2500,
        "more than one batch"
      );
      assert.deepEqual(
        await to
          .collection("users")
          .find({}, { projection: { _id: 0 } })
          .sort({ username: 1 })
          .toArray(),
        await from
          .collection("users")
          .find({}, { projection: { _id: 0 } })
          .sort({ username: 1 })
          .toArray()
      );

      const usernameIndex = (await to.collection("users").indexes()).find(
        (i) => i.key.username
      );
      assert.equal(usernameIndex.unique, true);
      assert.equal(
        usernameIndex.collation.strength,
        2,
        "still case-insensitive"
      );

      const ttl = (await to.collection("sessions").indexes()).find(
        (i) => i.key.expires
      );
      assert.equal(ttl.expireAfterSeconds, 0, "sessions still expire");
    }
  );

  // The unique index is in place before the documents arrive, and carries its
  // collation: "peteb" is the same username as "PeteB" on the new cluster too.
  await t.test("the copied unique index is enforced", async () => {
    await assert.rejects(
      to.collection("users").insertOne({ username: "peteb" }),
      /duplicate key/
    );
  });

  await t.test(
    "it will not copy into a database that already has data",
    async () => {
      // The target still holds the previous copy.
      await assert.rejects(
        copyDatabase({
          sourceUri: SOURCE,
          targetUri: TARGET,
          copy: true,
          log: quiet,
        }),
        /already has documents/
      );
    }
  );

  await t.test("it will not copy a database onto itself", async () => {
    await assert.rejects(
      copyDatabase({
        sourceUri: SOURCE,
        targetUri: SOURCE,
        copy: true,
        log: quiet,
      }),
      /same database/
    );
  });

  await t.test("it will not guess a database name", async () => {
    await assert.rejects(
      copyDatabase({
        sourceUri: "mongodb://localhost/",
        targetUri: TARGET,
        copy: true,
        log: quiet,
      }),
      /database name/
    );
  });
});

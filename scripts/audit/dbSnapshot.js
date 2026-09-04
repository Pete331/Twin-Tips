// Snapshot and restore the LOCAL twin-tips database.
//
//   node scripts/audit/dbSnapshot.js dump  <dir>
//   node scripts/audit/dbSnapshot.js load  <dir>
//
// Written because mongodump is not installed on this machine. Uses the extended
// JSON the driver already speaks, so ObjectIds and Dates survive the round trip
// rather than arriving back as strings.
//
// Refuses to touch anything that is not localhost. This exists to protect a
// development database while an audit rewrites it; pointing it at Atlas would
// be the exact accident it is meant to prevent.

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
// From bson directly: the 7.x driver stopped re-exporting EJSON.
const { EJSON } = require("bson");

const URI = process.env.AUDIT_MONGODB_URI || "mongodb://localhost/twin-tips";
const DB = "twin-tips";

if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(URI)) {
  console.error(`Refusing to run against ${URI} - localhost only.`);
  process.exit(1);
}

const [, , mode, dir] = process.argv;
if (!["dump", "load"].includes(mode) || !dir) {
  console.error("usage: dbSnapshot.js dump|load <dir>");
  process.exit(1);
}

(async () => {
  const client = await MongoClient.connect(URI);
  const db = client.db(DB);

  if (mode === "dump") {
    fs.mkdirSync(dir, { recursive: true });
    const cols = await db.listCollections().toArray();
    for (const { name } of cols) {
      const docs = await db.collection(name).find({}).toArray();
      fs.writeFileSync(
        path.join(dir, `${name}.json`),
        EJSON.stringify(docs, { relaxed: false })
      );
      console.log(`  ${name.padEnd(24)} ${String(docs.length).padStart(6)} -> ${name}.json`);
    }
    // Indexes travel separately: they are not documents, and a restore that
    // dropped them would leave a database that behaves differently under load
    // without looking any different.
    const indexes = {};
    for (const { name } of cols) {
      indexes[name] = await db.collection(name).indexes();
    }
    fs.writeFileSync(
      path.join(dir, "_indexes.json"),
      JSON.stringify(indexes, null, 2)
    );
    console.log(`  indexes recorded in _indexes.json`);
  } else {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json") || file.startsWith("_")) continue;
      const name = file.replace(/\.json$/, "");
      const docs = EJSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      await db.collection(name).deleteMany({});
      if (docs.length) await db.collection(name).insertMany(docs);
      console.log(`  ${name.padEnd(24)} restored ${docs.length}`);
    }
  }

  await client.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

// Copy the whole database from one MongoDB to another.
//
// Written to move production from the free cluster in Sydney to a free one in
// Singapore, next to Render. Render has no Australian region, so with the
// database in Sydney every query the app made crossed between the two - about
// 90ms each, several per request.
//
// Both connection strings come from the environment, so neither is ever typed
// into a command line or a file. In PowerShell:
//
//   $env:SOURCE_URI = "mongodb+srv://...the old cluster.../twin-tips?..."
//   $env:TARGET_URI = "mongodb+srv://...the new cluster.../twin-tips?..."
//   node scripts/copyDatabase.js            # says what it would copy
//   node scripts/copyDatabase.js --copy     # copies it
//
// Every collection comes across with its documents and its indexes - the
// sessions too, so nobody is signed out by the move. Then each collection's
// count is checked against the source, and the run fails if any differ.
//
// It refuses rather than guesses: a URI without a database name (the driver
// would quietly use "test"), the same database on both sides, or a target that
// already holds documents. Nothing is ever written to the source.
//
// It prints hosts and database names, never a connection string: those carry
// the password.

const { MongoClient } = require("mongodb");

const BATCH = 1000;

// The database named in a URI, or null. The driver falls back to "test"
// without one, which is exactly the mistake render.yaml warns about for
// MONGODB_URI.
const databaseOf = (uri) => {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(String(uri || ""));
  const name = match && decodeURIComponent(match[1]);
  return name && name !== "test" && name !== "admin" ? name : null;
};

// Somewhere to say which cluster is which, without the credentials.
const describe = (uri) => {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(String(uri || ""));
  return `${match ? match[1] : "(unreadable host)"}/${databaseOf(uri) || "?"}`;
};

// An index as createIndex wants it: the key, and every option but the ones the
// server fills in for itself.
const indexSpec = ({ key, v, ns, ...options }) => ({ key, options });

const copyDatabase = async ({ sourceUri, targetUri, copy = false, log = console.log }) => {
  if (!sourceUri || !targetUri) {
    throw new Error("Set both SOURCE_URI and TARGET_URI.");
  }
  if (!databaseOf(sourceUri) || !databaseOf(targetUri)) {
    throw new Error(
      "Both URIs need the database name before the query string - " +
        "mongodb+srv://host/twin-tips?... - or the driver quietly uses \"test\"."
    );
  }
  if (describe(sourceUri) === describe(targetUri)) {
    throw new Error("SOURCE_URI and TARGET_URI are the same database.");
  }

  const source = await MongoClient.connect(sourceUri, { serverSelectionTimeoutMS: 15000 });
  const target = await MongoClient.connect(targetUri, { serverSelectionTimeoutMS: 15000 });

  try {
    const from = source.db(databaseOf(sourceUri));
    const to = target.db(databaseOf(targetUri));

    log(`From ${describe(sourceUri)}`);
    log(`To   ${describe(targetUri)}`);

    // Anything already there means this is not the empty database it should
    // be - a second run, or the wrong URI. Either way, stop before writing.
    const already = [];
    for (const { name } of await to.listCollections({}, { nameOnly: true }).toArray()) {
      if (name.startsWith("system.")) continue;
      const count = await to.collection(name).estimatedDocumentCount();
      if (count) already.push(`${name} (${count})`);
    }
    if (already.length) {
      throw new Error(
        `The target already has documents in ${already.join(", ")}. ` +
          "Copy into an empty database."
      );
    }

    const collections = (await from.listCollections({ type: "collection" }).toArray())
      .map((c) => c.name)
      .filter((name) => !name.startsWith("system."))
      .sort();

    const report = [];
    for (const name of collections) {
      const indexes = (await from.collection(name).indexes())
        .filter((index) => index.name !== "_id_")
        .map(indexSpec);
      const count = await from.collection(name).countDocuments();

      if (copy) {
        // The collection and its indexes first, so a unique index is in
        // force for every document that arrives.
        await to.createCollection(name).catch((err) => {
          if (err.codeName !== "NamespaceExists") throw err;
        });
        for (const { key, options } of indexes) {
          await to.collection(name).createIndex(key, options);
        }

        let batch = [];
        for await (const doc of from.collection(name).find({})) {
          batch.push(doc);
          if (batch.length === BATCH) {
            await to.collection(name).insertMany(batch, { ordered: true });
            batch = [];
          }
        }
        if (batch.length) await to.collection(name).insertMany(batch, { ordered: true });
      }

      const copied = copy ? await to.collection(name).countDocuments() : null;
      report.push({ name, count, copied, indexes: indexes.length });
    }

    for (const r of report) {
      log(
        `  ${r.name.padEnd(22)} ${String(r.count).padStart(6)} documents` +
          `${r.indexes ? `, ${r.indexes} index${r.indexes === 1 ? "" : "es"}` : ""}` +
          (copy ? `  ->  ${r.copied}${r.copied === r.count ? "" : "  MISMATCH"}` : "")
      );
    }

    if (!copy) {
      log("\nNothing written. Run again with --copy to copy it.");
      return { copied: false, report };
    }

    const mismatched = report.filter((r) => r.copied !== r.count);
    if (mismatched.length) {
      throw new Error(`Counts differ for ${mismatched.map((r) => r.name).join(", ")}.`);
    }
    log(`\nCopied ${report.length} collections; every count matches.`);
    return { copied: true, report };
  } finally {
    await source.close();
    await target.close();
  }
};

if (require.main === module) {
  copyDatabase({
    sourceUri: process.env.SOURCE_URI,
    targetUri: process.env.TARGET_URI,
    copy: process.argv.includes("--copy"),
  }).catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
  });
}

module.exports = { copyDatabase, databaseOf, describe };

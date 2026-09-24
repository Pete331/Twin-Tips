// A failure answers with a failure status.
//
// Four routes answered a database error with res.json(err): HTTP 200, and the
// raw error object as the body. Two things wrong at once. A caller sees
// success - axios resolves on any 2xx, so no catch block runs anywhere - and
// the body carries whatever the error carried, which for a Mongo error can be
// the query, the model and path names, and the connection string.
//
// The tip save was the one that mattered (see routes/tips.route.test.js, where
// its failure is tested with the rest of that route). The other two are here:
// the player's own tip, and their own account. The fourth, POST /api/teams,
// has been removed rather than fixed - it emptied the teams collection before
// writing the request body into it, and nothing called it.
//
// No database: each read is made to fail directly, which is the only case
// under test. The source scan at the end is what stops the pattern coming back
// in a route nobody has written yet.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("fs");
const path = require("path");

const db = require("../models");

const LEAK = "mongodb://user:secret@cluster.example/twin-tips";
const failure = () =>
  Object.assign(new Error(`connection reset by ${LEAK}`), {
    name: "MongoNetworkError",
  });

const withApp = async (fn) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = { id: "64b000000000000000000001", admin: true };
    next();
  });
  require("./api-routes.js")(app);

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(async (method, url, body) => {
      const res = await fetch(base + url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const raw = await res.text();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        /* not json */
      }
      return { status: res.status, json, raw };
    });
  } finally {
    server.close();
  }
};

// Stands a model method in for the length of one test, and puts it back.
const failing = async (model, method, make, fn) => {
  const real = model[method];
  model[method] = make;
  try {
    await fn();
  } finally {
    model[method] = real;
  }
};

test("the player's own tip, when it cannot be read", async () => {
  await failing(
    db.Tip,
    "findOne",
    () => Promise.reject(failure()),
    () =>
      withApp(async (call) => {
        const res = await call("POST", "/api/userRoundTips", {
          data: { round: 4 },
          season: 2026,
        });

        assert.equal(res.status, 500);
        assert.equal(res.json.success, false);
        assert.equal(
          res.raw.includes("secret"),
          false,
          "the error's text stays on the server"
        );
      })
  );
});

test("the player's own account, when it cannot be read", async () => {
  // findOne(...).populate(...) - the failure arrives from the populate.
  await failing(
    db.User,
    "findOne",
    () => ({ populate: () => Promise.reject(failure()) }),
    () =>
      withApp(async (call) => {
        const res = await call("POST", "/api/users", {});

        assert.equal(res.status, 500);
        assert.equal(res.json.success, false);
        assert.equal(res.raw.includes("secret"), false);
      })
  );
});

test("the teams route that emptied the collection first is gone", async () => {
  let wiped = false;
  await failing(
    db.Team,
    "deleteMany",
    async () => {
      wiped = true;
    },
    () =>
      withApp(async (call) => {
        const res = await call("POST", "/api/teams", {
          teams: [{ id: 1, name: "x" }],
        });

        assert.equal(res.status, 404);
        assert.equal(wiped, false, "nothing reached deleteMany");
      })
  );
});

// --------------------------------------------------------------- the pattern

const DIRECTORIES = ["routes", "controllers"];
const ROOT = path.join(__dirname, "..");

const sources = () =>
  DIRECTORIES.flatMap((dir) => {
    const walk = (d) =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return walk(p);
        if (!e.name.endsWith(".js") || e.name.endsWith(".test.js")) return [];
        const text = fs
          .readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        return [
          { file: path.relative(ROOT, p).split(path.sep).join("/"), text },
        ];
      });
    return walk(path.join(ROOT, dir));
  });

// Any response built from the error object itself: res.json(err),
// res.send(error), res.status(500).json(e) and the like.
const ECHO = /\.(json|send)\(\s*(err|error|e)\s*\)/g;

test("the scan reaches the route files", () => {
  const files = sources().map((s) => s.file);
  assert.ok(files.includes("routes/api-routes.js"));
  assert.ok(files.includes("controllers/authController.js"));
});

test("no route answers with the error object itself", () => {
  const echoes = sources().flatMap(({ file, text }) =>
    [...text.matchAll(ECHO)].map((m) => `${file}: ${m[0]}`)
  );

  assert.deepEqual(
    echoes,
    [],
    "log the error and answer res.status(5xx).json({ success: false, message }) - " +
      "never the error object, which carries internals and arrives as a success"
  );
});

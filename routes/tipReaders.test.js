// Which routes may read another player's tips, enforced rather than agreed.
//
// A tip is private until its round bounces, and the rule that keeps it so
// lives in one place: selectionsVisible, which POST /api/roundResult applies
// before anything leaves the server. That only protects the routes that call
// it. POST /api/leaderboard read every tip of a season - the round being tipped
// included - and called nothing, so any signed-in account could read the
// field's live picks before the first bounce. It sat there unused by the
// client for as long as the other routes had been careful, because a route
// that is not called is a route nobody looks at.
//
// So this counts. In the route layer a many-tip read is allowed exactly where
// the masking happens, and every single-tip read must be the caller's own.
// A source scan rather than a request, because the thing worth catching is
// somebody writing the query - by the time a request can see it, it is live.
//
// Services read tips freely and should: scoring, ladders and pools need every
// tip. What they return to a route is shaped there (see roundDetail and its
// showSelections), and routes/rounds.route.test.js asks each of those routes
// what it hands back.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIRECTORIES = ["routes", "controllers", "middleware"];

// Many tips at once. POST /api/roundResult, which masks the picks until the
// round locks. Counted, so a second one in the same file is caught as surely
// as a first one elsewhere.
const MANY = { "routes/api-routes.js": 1 };

// Round numbers only, never a pick: the admin status page asking which rounds
// have been scored. Behind requireAdmin.
const DISTINCT = { "routes/season.js": 1 };

const sources = () => {
  const out = [];
  for (const dir of DIRECTORIES) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (
          entry.name.endsWith(".js") &&
          !entry.name.endsWith(".test.js")
        ) {
          out.push({
            file: path.relative(ROOT, p).split(path.sep).join("/"),
            text: fs.readFileSync(p, "utf8"),
          });
        }
      }
    };
    walk(full);
  }
  return out;
};

// Comments are stripped first, so the note left where a route was removed -
// which names the query it used to run - does not count as the query.
const code = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const count = (text, pattern) => (code(text).match(pattern) || []).length;

const FIND = /\bTip\.find\(/g;
const FIND_ONE = /\bTip\.findOne\(/g;
const DISTINCT_RE = /\bTip\.distinct\(/g;
const OTHER = /\bTip\.(aggregate|countDocuments|findById)\(/g;

// A scan that finds nothing passes everything below, so the scan is checked
// first: it has to reach the route files, and its patterns have to match the
// reads that are known to be there.
test("the scan reaches the routes, and its patterns match", () => {
  const files = sources();
  const routes = files.find((f) => f.file === "routes/api-routes.js");

  assert.ok(files.length >= 5, `only ${files.length} files scanned`);
  assert.ok(routes, "routes/api-routes.js was not scanned");
  assert.ok(
    count(routes.text, FIND) >= 1,
    "Tip.find no longer matches anything"
  );
  assert.ok(
    count(routes.text, FIND_ONE) >= 1,
    "Tip.findOne no longer matches anything"
  );
});

test("many tips are read only where the picks are masked", () => {
  const found = {};
  for (const { file, text } of sources()) {
    const n = count(text, FIND);
    if (n) found[file] = n;
  }

  assert.deepEqual(
    found,
    MANY,
    "Tip.find in a route reads other players' tips. Before adding one, pass " +
      "each round through selectionsVisible as POST /api/roundResult does, " +
      "then add it here with a note saying where it masks."
  );
});

test("every single-tip read is the caller's own", () => {
  const strangers = [];
  for (const { file, text } of sources()) {
    const body = code(text);
    for (const match of body.matchAll(FIND_ONE)) {
      // The query object that follows, up to its closing brace.
      const tail = body.slice(match.index, match.index + 200);
      const query = tail.slice(0, tail.indexOf("}") + 1);
      if (!/user:\s*req\.user\.id\b/.test(query)) {
        strangers.push(`${file}: ${query.replace(/\s+/g, " ")}`);
      }
    }
  }

  assert.deepEqual(
    strangers,
    [],
    "a single tip read in a route must be scoped to user: req.user.id"
  );
});

test("nothing else reads tips in a route", () => {
  const distinct = {};
  const other = [];
  for (const { file, text } of sources()) {
    const n = count(text, DISTINCT_RE);
    if (n) distinct[file] = n;
    if (count(text, OTHER)) other.push(file);
  }

  assert.deepEqual(distinct, DISTINCT);
  assert.deepEqual(other, []);
});

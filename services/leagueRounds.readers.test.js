// Who is allowed to touch LeagueRoundResult, enforced rather than agreed.
//
// The rows outlive the membership that produced them. A result is written for
// every member who tipped a round, and the member-removal route in
// routes/leagues.js deliberately keeps it when they leave - the league's
// history is a record of rounds that were played, and removing somebody does
// not unplay them. So the collection holds rows belonging to people who are no
// longer in the league: one local league carries 25 of them for a single
// departed member, three of which pay out.
//
// That was defended for a while by two readers each remembering to filter. It
// held, but it held by convention, and the failure mode of the convention
// lapsing is silent and about money: the obvious query - find every result for
// this league and round - hands back a stranger who won $25, and the table
// renders them without complaint. The home page had exactly this bug in a
// different form, crowning the site-wide round winner in a league they were
// not a member of.
//
// So there is now one reader, resultsFor, and this fails if a second appears.
// It is a source scan rather than a runtime check because the thing worth
// preventing is somebody writing the query at all.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Application code only.
//
// Not scripts/: migrateToLeagues backfills this collection wholesale and
// seedLeagues deletes it wholesale, which is what those are for. Neither
// serves a page, and neither is where the mistake would be made.
const DIRECTORIES = ["services", "routes", "controllers", "middleware"];

// What the application may do to this collection, and how many times.
//
// Counted rather than listed, so adding a second find() to leagueRounds.js is
// caught exactly as surely as adding a first one somewhere else.
const ALLOWED = {
  "services/leagueRounds.js": {
    // scoreRound, writing what a round paid.
    bulkWrite: 1,
    // scoreSeason, asking only which rounds have been scored at all. A round
    // whose only rows belong to a departed member has still been scored, so
    // this one deliberately does not filter - it would otherwise re-score that
    // round every hour for the rest of the season.
    distinct: 1,
    // resultsFor. This is the one.
    find: 1,
  },
};

const WHY = [
  "LeagueRoundResult is accessed somewhere outside the allowlist.",
  "",
  "These rows outlive the membership that produced them - leaving a league",
  "keeps your results, on purpose - so a plain query returns people who are",
  "not in the league. One of them, locally, is recorded as having won three",
  "rounds at $25 a time.",
  "",
  "Read through resultsFor(league, season, members) in services/leagueRounds.js.",
  "It drops rows belonging to former members, and rows for rounds a current",
  "member had not yet joined.",
  "",
  "If a new direct use is genuinely right, add it to ALLOWED above with a",
  "comment saying why it does not need filtering.",
].join("\n");

const sourceFiles = () => {
  const found = [];

  const walk = (relative) => {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) return;

    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(next);
      } else if (entry.name.endsWith(".js") && !entry.name.includes(".test.")) {
        found.push(next);
      }
    }
  };

  DIRECTORIES.forEach(walk);
  return found;
};

const inventory = () => {
  const found = {};

  for (const file of sourceFiles()) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const uses = source.match(/db\.LeagueRoundResult\.(\w+)/g) || [];

    for (const use of uses) {
      const method = use.split(".").pop();
      found[file] = found[file] || {};
      found[file][method] = (found[file][method] || 0) + 1;
    }
  }

  return found;
};

test("nothing but resultsFor reads LeagueRoundResult", () => {
  assert.deepEqual(inventory(), ALLOWED, WHY);
});

// A guard that scans nothing passes everything. This is what says the scan is
// actually looking at the source - without it, a wrong ROOT or a directory
// rename would turn the test above into a test of an empty object against an
// empty object.
test("the scan reaches the source it claims to cover", () => {
  const files = sourceFiles();

  assert.ok(files.length > 20, `only ${files.length} source files scanned`);
  assert.ok(
    files.includes("services/leagueRounds.js"),
    "the file the allowlist is about was not scanned"
  );
  assert.ok(files.includes("routes/leagues.js"));
  assert.ok(
    !files.some((f) => f.includes(".test.")),
    "test files must not count toward the inventory"
  );
});

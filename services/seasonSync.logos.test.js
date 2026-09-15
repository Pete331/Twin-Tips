// The logo files and the two places that spell out their names, kept in step.
//
// Nothing renders a club logo through a helper. FixtureCard builds the src
// inline, and seasonSync checks the same filename on disk so that a club
// Squiggle renames - Gold Coast went from GC to GCS - is reported at sync time
// rather than discovered later as a blank card. That is one filename written
// out twice, in two languages, in two files, and neither copy is visible from
// the other.
//
// Changing the image format is precisely the edit that splits them. Move the
// img src and the existence check keeps testing for files that are no longer
// there, so it reports every club in the competition as missing. Move the
// check and the page asks for files nobody added. Both failures are quiet:
// one is a console warning during a cron run, the other an onError handler
// that hides the image and leaves the card looking merely plain.
//
// So the extension is read back out of both sources and compared, and the
// folder has to agree with them. A source scan rather than a runtime check
// because the point is to catch the edit, not the symptom.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const CARD = path.join(
  ROOT,
  "client",
  "src",
  "components",
  "FixtureCard",
  "index.jsx"
);
const SYNC = path.join(ROOT, "services", "seasonSync.js");
const LOGOS = path.join(ROOT, "client", "public", "assets", "team-logos");

// src={`/assets/team-logos/${habrev}.png`} - once for each side of the game.
const IN_CARD = /\/assets\/team-logos\/\$\{\w+\}\.(\w+)`/g;
// path.join(LOGO_DIR, `${team.abbrev}.png`) - the file missingLogos looks for.
const IN_SYNC = /\$\{team\.abbrev\}\.(\w+)`/g;

const extensions = (file, pattern) =>
  [...fs.readFileSync(file, "utf8").matchAll(pattern)].map((hit) => hit[1]);

// A scan that finds nothing passes every comparison below, so the scan itself
// is checked first. If either file is moved or rewritten past these patterns
// this is the test that says so, rather than the suite going quietly green.
test("both sources are where this test thinks they are", () => {
  const card = extensions(CARD, IN_CARD);
  const sync = extensions(SYNC, IN_SYNC);

  assert.equal(card.length, 2, "FixtureCard should name a logo for each side");
  assert.equal(sync.length, 1, "seasonSync should check one logo filename");
});

test("the card and the sync check agree on the format", () => {
  const [home, away] = extensions(CARD, IN_CARD);
  const [check] = extensions(SYNC, IN_SYNC);

  assert.equal(home, away, "the two sides of a fixture disagree");
  assert.equal(
    check,
    home,
    "seasonSync checks for a file the page does not ask for, so every club " +
      "will be reported as having no logo while the cards quietly hide theirs"
  );
});

test("and the files on disk are in that format", () => {
  const [wanted] = extensions(SYNC, IN_SYNC);
  const files = fs.readdirSync(LOGOS);

  assert.ok(files.length, "no logo files at all");

  const strays = files.filter((file) => path.extname(file) !== `.${wanted}`);
  assert.deepEqual(
    strays,
    [],
    `left over from a previous format: ${strays.join(", ")}`
  );
});

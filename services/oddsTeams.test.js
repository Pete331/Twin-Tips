const test = require("node:test");
const assert = require("node:assert");

const {
  normalise,
  teamIdFor,
  resolveEventTeams,
  mappedTeamIds,
} = require("./oddsTeams");

// The eighteen clubs as Squiggle stores them, checked against the database in
// scripts/auditOddsTeams.js. Repeated here so the pure tests need no
// connection - the audit is what catches the table drifting from the data.
const SQUIGGLE_NAMES = [
  [1, "Adelaide"],
  [2, "Brisbane Lions"],
  [3, "Carlton"],
  [4, "Collingwood"],
  [5, "Essendon"],
  [6, "Fremantle"],
  [7, "Geelong"],
  [8, "Gold Coast"],
  [9, "Greater Western Sydney"],
  [10, "Hawthorn"],
  [11, "Melbourne"],
  [12, "North Melbourne"],
  [13, "Port Adelaide"],
  [14, "Richmond"],
  [15, "St Kilda"],
  [16, "Sydney"],
  [17, "West Coast"],
  [18, "Western Bulldogs"],
];

test("every club Twin Tips stores resolves to its own id", () => {
  for (const [id, name] of SQUIGGLE_NAMES) {
    assert.equal(teamIdFor(name), id, `${name} should resolve to ${id}`);
  }
});

test("all eighteen are mapped, and nothing beyond them", () => {
  assert.deepEqual(
    mappedTeamIds(),
    SQUIGGLE_NAMES.map(([id]) => id)
  );
});

// The reason the table exists: feeds use the full club name, Twin Tips does
// not, and nothing joins the two.
test("full club names resolve", () => {
  const cases = [
    ["Adelaide Crows", 1],
    ["Carlton Blues", 3],
    ["Fremantle Dockers", 6],
    ["Gold Coast Suns", 8],
    ["North Melbourne Kangaroos", 12],
    ["Port Adelaide Power", 13],
    ["St Kilda Saints", 15],
    ["Sydney Swans", 16],
    ["West Coast Eagles", 17],
  ];

  for (const [name, id] of cases) {
    assert.equal(teamIdFor(name), id, `${name} should resolve to ${id}`);
  }
});

// GWS is the one that is nearly always abbreviated, and the abbreviation is not
// a prefix of the full name, so no amount of string cleverness gets there.
test("Greater Western Sydney resolves however it is written", () => {
  for (const name of [
    "Greater Western Sydney",
    "Greater Western Sydney Giants",
    "GWS",
    "GWS Giants",
    "Giants",
  ]) {
    assert.equal(teamIdFor(name), 9, name);
  }
});

test("punctuation, case and spacing do not matter", () => {
  assert.equal(teamIdFor("st kilda"), 15);
  assert.equal(teamIdFor("St. Kilda"), 15);
  assert.equal(teamIdFor("ST KILDA SAINTS"), 15);
  assert.equal(teamIdFor("  Western   Bulldogs  "), 18);
  assert.equal(normalise("St. Kilda"), normalise("st kilda"));
});

// A name nobody recognises has to be reported, not guessed. Fuzzy matching is
// how "Sydney" becomes the Swans in a week the fixture meant GWS.
test("an unknown name is null rather than a guess", () => {
  assert.equal(teamIdFor("Tasmania Devils"), null);
  assert.equal(teamIdFor("Fitzroy"), null);
  assert.equal(teamIdFor(""), null);
  assert.equal(teamIdFor(null), null);
  assert.equal(teamIdFor(undefined), null);
});

test("both sides of an event resolve together", () => {
  const ok = resolveEventTeams("Fremantle Dockers", "Hawthorn Hawks");
  assert.deepEqual(ok, { home: 6, away: 10, unresolved: [], ok: true });
});

test("an event names what it could not resolve", () => {
  const partial = resolveEventTeams("Adelaide Crows", "Tasmania Devils");
  assert.equal(partial.ok, false);
  assert.equal(partial.home, 1);
  assert.equal(partial.away, null);
  assert.deepEqual(partial.unresolved, ["Tasmania Devils"]);

  const neither = resolveEventTeams("Barassi United", "Tasmania Devils");
  assert.deepEqual(neither.unresolved, ["Barassi United", "Tasmania Devils"]);
});

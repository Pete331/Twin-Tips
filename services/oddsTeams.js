// Odds-feed club names to Squiggle team ids.
//
// Nothing joins these automatically. Twin Tips stores the short names Squiggle
// uses - "Adelaide", "Sydney", "West Coast" - and odds feeds use the full club
// names - "Adelaide Crows", "Sydney Swans", "West Coast Eagles". A fixture is
// matched to an odds event by the pair of team ids, so getting this wrong does
// not raise an error; it silently drops the game and the card shows nothing.
//
// Deliberately pure and offline. The whole point of doing this first is that it
// can be tested without spending a credit.

const db = require("../models");

// Comparison form: lower case, no punctuation, no spaces. "St Kilda",
// "St. Kilda" and "st kilda saints" all have to land on the same team, and a
// feed that changes "GWS Giants" to "Greater Western Sydney Giants" between
// seasons should not need a code change.
const normalise = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Every form worth accepting, per Squiggle team id.
//
// Written out rather than derived. A rule like "club name plus nickname" looks
// tidy until Western Bulldogs, which has no separate nickname, and Greater
// Western Sydney, which is usually abbreviated. Twenty minutes of typing beats
// a clever function that is wrong twice.
//
// The abbreviations are here because Squiggle uses them elsewhere in the app
// and a feed may well send them; they cost nothing to accept.
const ALIASES = {
  1: ["Adelaide", "Adelaide Crows", "Crows", "ADE"],
  2: ["Brisbane Lions", "Brisbane", "Lions", "BRI"],
  3: ["Carlton", "Carlton Blues", "Blues", "CAR"],
  4: ["Collingwood", "Collingwood Magpies", "Magpies", "COL"],
  5: ["Essendon", "Essendon Bombers", "Bombers", "ESS"],
  6: ["Fremantle", "Fremantle Dockers", "Dockers", "FRE"],
  7: ["Geelong", "Geelong Cats", "Cats", "GEE"],
  8: ["Gold Coast", "Gold Coast Suns", "Suns", "GCS", "GC"],
  9: [
    "Greater Western Sydney",
    "Greater Western Sydney Giants",
    "GWS",
    "GWS Giants",
    "Giants",
  ],
  10: ["Hawthorn", "Hawthorn Hawks", "Hawks", "HAW"],
  11: ["Melbourne", "Melbourne Demons", "Demons", "MEL"],
  12: [
    "North Melbourne",
    "North Melbourne Kangaroos",
    "Kangaroos",
    "NOR",
    "NM",
  ],
  13: ["Port Adelaide", "Port Adelaide Power", "Power", "POR", "PA"],
  14: ["Richmond", "Richmond Tigers", "Tigers", "RIC"],
  15: ["St Kilda", "St Kilda Saints", "Saints", "STK"],
  16: ["Sydney", "Sydney Swans", "Swans", "SYD"],
  17: ["West Coast", "West Coast Eagles", "Eagles", "WCE", "WC"],
  18: ["Western Bulldogs", "Bulldogs", "Footscray", "WBD", "WB"],
};

// Built once at load: normalised alias -> team id.
const BY_NAME = new Map();
for (const [id, names] of Object.entries(ALIASES)) {
  for (const name of names) {
    const key = normalise(name);
    // A collision would mean two teams answering to one name, which is a bug
    // in the table rather than something to resolve at runtime.
    if (BY_NAME.has(key) && BY_NAME.get(key) !== Number(id)) {
      throw new Error(
        `Ambiguous team alias "${name}": ${BY_NAME.get(key)} and ${id}`
      );
    }
    BY_NAME.set(key, Number(id));
  }
}

// The Squiggle team id for a name from the feed, or null.
//
// null rather than a guess. Fuzzy matching a club name is how "Sydney" ends up
// as Sydney Swans in a week when the fixture meant Greater Western Sydney - the
// caller reports what it could not resolve and a human adds the alias.
const teamIdFor = (name) => {
  const id = BY_NAME.get(normalise(name));
  return id === undefined ? null : id;
};

// Both sides of an event at once, so a caller can test a whole fixture in one
// call and report the pair it failed on rather than one name at a time.
const resolveEventTeams = (homeName, awayName) => {
  const home = teamIdFor(homeName);
  const away = teamIdFor(awayName);

  const unresolved = [];
  if (home === null) unresolved.push(homeName);
  if (away === null) unresolved.push(awayName);

  return { home, away, unresolved, ok: unresolved.length === 0 };
};

// Every id the table covers, for the test that checks it against the database.
const mappedTeamIds = () => Object.keys(ALIASES).map(Number).sort((a, b) => a - b);

// Checks the table against the teams actually stored, so a club that is added,
// renamed or relocated shows up as a failure here rather than as odds quietly
// missing from a fixture. Async and touches the database, so it belongs in a
// startup check or a script rather than in the pure path above.
const auditAgainstTeams = async () => {
  const teams = await db.Team.find({}).select("id name").lean();

  const missing = teams.filter((team) => !ALIASES[team.id]);
  const unknownName = teams.filter(
    (team) => ALIASES[team.id] && teamIdFor(team.name) !== team.id
  );
  const extra = mappedTeamIds().filter(
    (id) => !teams.some((team) => team.id === id)
  );

  return {
    teams: teams.length,
    mapped: mappedTeamIds().length,
    missing: missing.map((t) => `${t.id} ${t.name}`),
    unknownName: unknownName.map((t) => `${t.id} ${t.name}`),
    extra,
    ok: !missing.length && !unknownName.length && !extra.length,
  };
};

module.exports = {
  normalise,
  teamIdFor,
  resolveEventTeams,
  mappedTeamIds,
  auditAgainstTeams,
  ALIASES,
};

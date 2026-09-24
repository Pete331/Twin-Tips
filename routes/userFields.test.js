// A populated user carries only the fields it names.
//
// Password and reset tokens are select: false on the schema, so they never
// leave by accident. Email, first and last name and the admin flag are not -
// login, the reset mail and the settings page all need them - which means a
// bare populate of a user hands them over. POST /api/roundResult did exactly
// that: every player's address and full name, to every signed-in account, on
// a page that only ever draws the username.
//
// So every populate of a path that refers to a user has to say which fields it
// wants. A source scan, because the mistake is invisible in a response until
// someone goes looking - by which point it has been live.
//
// Paths that refer to other models (a fixture's teams, a membership's league)
// can populate as they like; the rule is about people.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIRECTORIES = ["routes", "controllers", "services"];

// Paths whose ref is User, as the models declare them.
const USER_PATHS = ["userDetail", "user", "admin", "standings.user"];

const sources = () => {
  const out = [];
  for (const dir of DIRECTORIES) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (!name.endsWith(".js") || name.endsWith(".test.js")) continue;
      const text = fs
        .readFileSync(path.join(ROOT, dir, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      out.push({ file: `${dir}/${name}`, text });
    }
  }
  return out;
};

// Every populate call with the text of its argument, up to the closing paren.
const populates = () =>
  sources().flatMap(({ file, text }) =>
    [...text.matchAll(/\.populate\(([^)]*)\)/g)].map((m) => ({
      file,
      arg: m[1].replace(/\s+/g, " ").trim(),
    }))
  );

// The path and the field list, in either of the forms Mongoose accepts:
// populate("user", "username") and populate({ path: "user", select: "username" }).
const parse = (arg) => {
  const positional = arg.match(
    /^["'`]([^"'`]+)["'`]\s*(?:,\s*["'`]([^"'`]*)["'`])?$/
  );
  if (positional) return { path: positional[1], select: positional[2] ?? null };

  const keyedPath = arg.match(/path:\s*["'`]([^"'`]+)["'`]/);
  const keyedSelect = arg.match(/select:\s*["'`]([^"'`]*)["'`]/);
  return {
    path: keyedPath ? keyedPath[1] : null,
    select: keyedSelect ? keyedSelect[1] : null,
  };
};
const pathOf = (arg) => parse(arg).path;

// A scan that sees nothing passes, so this checks it sees what is known to be
// there: the round result's user populate and the fixture's team populates.
test("the scan finds the populates it should", () => {
  const all = populates();
  const paths = all.map((p) => pathOf(p.arg));

  assert.ok(paths.includes("userDetail"), "no userDetail populate found");
  assert.ok(paths.includes("home-team"), "no team populate found");
  assert.ok(all.length >= 8, `only ${all.length} populates found`);
});

test("every populate of a user names its fields", () => {
  const bare = populates()
    .filter((p) => USER_PATHS.includes(pathOf(p.arg)))
    .filter((p) => parse(p.arg).select === null)
    .map((p) => `${p.file}: populate(${p.arg})`);

  assert.deepEqual(
    bare,
    [],
    "a populated user must say which fields it wants - usually just username"
  );
});

test("and none of them asks for the private ones", () => {
  const PRIVATE =
    /\b(email|firstName|lastName|password|resetPassToken|tokenExpiration)\b/;
  const asking = populates()
    .filter((p) => USER_PATHS.includes(pathOf(p.arg)))
    .filter((p) => PRIVATE.test(parse(p.arg).select || ""))
    .map((p) => `${p.file}: populate(${p.arg})`);

  assert.deepEqual(asking, []);
});

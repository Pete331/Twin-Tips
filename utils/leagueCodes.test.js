const test = require("node:test");
const assert = require("node:assert/strict");

const {
  newInviteToken,
  newJoinCode,
  normaliseJoinCode,
  slugify,
  CODE_ALPHABET,
} = require("./leagueCodes");

test("an invite token is 32 hex characters", () => {
  const token = newInviteToken();
  assert.match(token, /^[0-9a-f]{32}$/);
});

// The token is the only thing between a league and anyone who finds its URL,
// so it has to actually be random rather than merely look it.
test("invite tokens do not repeat", () => {
  const tokens = new Set();
  for (let i = 0; i < 500; i += 1) tokens.add(newInviteToken());
  assert.equal(tokens.size, 500);
});

test("a join code looks like TWIN-XXXX", () => {
  assert.match(newJoinCode(), /^TWIN-[34679ACDEFGHJKMNPQRTUVWXY]{4}$/);
});

// Every pair that gets confused when a code is read aloud, typed from a photo
// or written down.
test("the join code alphabet excludes ambiguous characters", () => {
  for (const c of "01258BILOSZ") {
    assert.equal(
      CODE_ALPHABET.includes(c),
      false,
      `${c} is too easily confused to be in a join code`
    );
  }
});

test("codes spread across the alphabet", () => {
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    for (const c of newJoinCode().slice(5)) seen.add(c);
  }
  // With 25 letters and 1600 draws, missing any of them means the generator
  // is not sampling evenly.
  assert.equal(seen.size, CODE_ALPHABET.length);
});

test("a join code is recognised however it was typed", () => {
  const code = "TWIN-4F9K";
  const expected = normaliseJoinCode(code);

  ["twin-4f9k", "TWIN 4F9K", " twin4f9k ", "4F9K", "4f9k"].forEach((typed) =>
    assert.equal(normaliseJoinCode(typed), expected, typed)
  );
});

test("normalising something empty does not throw", () => {
  assert.equal(normaliseJoinCode(null), "");
  assert.equal(normaliseJoinCode(undefined), "");
  assert.equal(normaliseJoinCode(""), "");
});

test("a slug is url-safe and carries a suffix", () => {
  assert.equal(slugify("Friday Night Tips", "k3f9"), "friday-night-tips-k3f9");
  assert.equal(slugify("The Boys' Comp!", "aa11"), "the-boys-comp-aa11");
});

// Anyone can create a league, so two groups will want the same name. The
// suffix is what stops that being a collision to handle at insert time.
test("the same name gives different slugs", () => {
  const a = slugify("Friday Night Tips");
  const b = slugify("Friday Night Tips");
  assert.notEqual(a, b);
  assert.match(a, /^friday-night-tips-[0-9a-f]{4}$/);
});

test("a name of pure punctuation still makes a usable slug", () => {
  assert.equal(slugify("!!!", "zz99"), "league-zz99");
  assert.equal(slugify("", "zz99"), "league-zz99");
});

test("a very long name is trimmed without leaving a trailing dash", () => {
  const slug = slugify("a".repeat(80), "beef");
  assert.equal(slug, `${"a".repeat(40)}-beef`);
  assert.equal(slug.includes("--"), false);
});

test("accents reduce to plain letters rather than disappearing", () => {
  assert.equal(slugify("Café Comp", "1234"), "cafe-comp-1234");
});

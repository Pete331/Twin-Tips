// Slugs, invite tokens and join codes for leagues.
//
// Pure and exported so the rules can be tested without a database, which
// matters more than usual here: the invite token is the only thing standing
// between a league and anyone who finds its URL.

const crypto = require("crypto");

// No 0/O, 1/I/L, 2/Z, 5/S, 8/B. A join code gets read aloud, typed from a
// photo of someone else's screen, and written down - so the alphabet leaves
// out every pair that gets confused doing any of that.
const CODE_ALPHABET = "34679ACDEFGHJKMNPQRTUVWXY";
const CODE_LENGTH = 4;

// 32 hex characters, from a CSPRNG. Long enough that guessing is not a threat
// model, which is the whole reason this replaced a user-chosen password.
const newInviteToken = () => crypto.randomBytes(16).toString("hex");

// Rejection sampling rather than modulo. Taking a random byte mod 25 would
// make the first six letters of the alphabet fractionally likelier than the
// rest - not a real weakness at this length, but the correct version is three
// lines longer and never needs revisiting.
const randomFrom = (alphabet) => {
  const limit = 256 - (256 % alphabet.length);
  for (;;) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < limit) return alphabet[byte % alphabet.length];
  }
};

// TWIN-4F9K. The prefix is fixed so a code is recognisable as belonging to
// this app when it turns up on its own in a message.
const newJoinCode = () => {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += randomFrom(CODE_ALPHABET);
  return `TWIN-${code}`;
};

// Codes are compared without case or the prefix, because people will type
// "twin 4f9k", "4F9K", or paste it with a stray space.
const normaliseJoinCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^TWIN/, "");

// The readable half of a league's URL. The random suffix is not decoration:
// anyone can create a league, so two groups will both want "friday-night-
// tips", and a collision would otherwise have to be handled at insert time.
const slugify = (name, suffix) => {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  const tail = suffix || crypto.randomBytes(2).toString("hex");

  // A name of nothing but punctuation still needs a usable slug.
  return `${base || "league"}-${tail}`;
};

module.exports = {
  newInviteToken,
  newJoinCode,
  normaliseJoinCode,
  slugify,
  CODE_ALPHABET,
};

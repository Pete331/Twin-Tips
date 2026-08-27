const test = require("node:test");
const assert = require("node:assert");

const { validUsername, isReservedUsername } = require("./username");

test("accepts the shapes people will actually use", () => {
  ["peteb", "Pete_B", "pete-b", "PETEB", "a1b", "x".repeat(20)].forEach((name) =>
    assert.equal(validUsername(name), true, name)
  );
});

test("rejects too short and too long", () => {
  assert.equal(validUsername("ab"), false);
  assert.equal(validUsername("x".repeat(21)), false);
});

// The rule the whole sign-in flow depends on: one field takes either a
// username or an email, and tells them apart by looking for an "@". A username
// containing one could never be used to sign in.
test("rejects anything containing an at sign", () => {
  assert.equal(validUsername("pete@x"), false);
  assert.equal(validUsername("pete@x.com"), false);
});

test("rejects spaces and punctuation", () => {
  ["pete b", "pete.b", "pete!", "pete/b", ""].forEach((name) =>
    assert.equal(validUsername(name), false, name)
  );
});

test("rejects non-strings rather than throwing", () => {
  [null, undefined, 42, {}].forEach((value) =>
    assert.equal(validUsername(value), false, String(value))
  );
});

test("reserves names regardless of case", () => {
  ["admin", "Admin", "ADMIN", "settings", "api"].forEach((name) =>
    assert.equal(isReservedUsername(name), true, name)
  );
  assert.equal(isReservedUsername("peteb"), false);
});

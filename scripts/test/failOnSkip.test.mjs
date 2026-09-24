// The CI reporter that turns a skipped test into a failed run. The wiring -
// that node --test really does exit non-zero with it attached - is checked
// end to end below, against a throwaway test file that skips.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reportSkips } from "./failOnSkip.mjs";

// As a URL: an absolute Windows path is read as a URL with the scheme "c:".
const REPORTER = new URL("./failOnSkip.mjs", import.meta.url).href;

const events = (...list) =>
  (async function* () {
    yield* list;
  })();

const run = async (source) => {
  let failed = false;
  let out = "";
  for await (const chunk of reportSkips(source, () => { failed = true; })) out += chunk;
  return { failed, out };
};

test("a run with no skips passes and says nothing", async () => {
  const { failed, out } = await run(events(
    { type: "test:pass", data: { name: "adds up", file: "a.test.js" } },
    { type: "test:fail", data: { name: "breaks", file: "b.test.js" } },
  ));

  assert.equal(failed, false);
  assert.equal(out, "");
});

test("a skipped test fails the run and is named with its reason", async () => {
  const { failed, out } = await run(events(
    { type: "test:pass", data: { name: "fine", file: "a.test.js" } },
    { type: "test:pass", data: { name: "the pool", file: "b.test.js", skip: "no local mongod" } },
    { type: "test:pass", data: { name: "the ladder", file: "c.test.js", skip: true } },
  ));

  assert.equal(failed, true);
  assert.match(out, /2 tests were skipped/);
  assert.match(out, /b\.test\.js: the pool \(no local mongod\)/);
  assert.match(out, /c\.test\.js: the ladder/);
});

// The part that cannot be checked with fake events: that a reporter setting
// the exit code is honoured by the real runner.
test("node --test exits non-zero with it attached, and only when something skipped", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fail-on-skip-"));
  try {
    const skips = path.join(dir, "skips.test.mjs");
    const passes = path.join(dir, "passes.test.mjs");
    fs.writeFileSync(skips, 'import test from "node:test";\ntest("needs a db", (t) => t.skip("no local mongod"));\n');
    fs.writeFileSync(passes, 'import test from "node:test";\ntest("fine", () => {});\n');

    // Without the parent runner's context variable, or the child takes itself
    // for a recursive call and runs nothing.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;

    const node = (file) =>
      spawnSync(process.execPath, [
        "--test",
        "--test-reporter=spec", "--test-reporter-destination=stdout",
        `--test-reporter=${REPORTER}`, "--test-reporter-destination=stderr",
        file,
      ], { encoding: "utf8", env });

    const skipped = node(skips);
    assert.equal(skipped.status, 1, skipped.stderr);
    assert.match(skipped.stderr, /needs a db \(no local mongod\)/);

    const clean = node(passes);
    assert.equal(clean.status, 0, clean.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

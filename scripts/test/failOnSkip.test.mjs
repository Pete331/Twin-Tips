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
  let totals = null;
  let out = "";
  for await (const chunk of reportSkips(
    source,
    () => { failed = true; },
    (t) => { totals = t; }
  )) out += chunk;
  return { failed, out, totals };
};

// What goes on the run's summary page. Suites are containers, not tests.
test("it counts tests the way node does", async () => {
  const { totals } = await run(events(
    { type: "test:pass", data: { name: "a", file: "a.test.js" } },
    { type: "test:pass", data: { name: "b", file: "a.test.js", details: { type: "test" } } },
    { type: "test:pass", data: { name: "group", file: "a.test.js", details: { type: "suite" } } },
    { type: "test:fail", data: { name: "c", file: "b.test.js" } },
    { type: "test:fail", data: { name: "broken group", file: "b.test.js", details: { type: "suite" } } },
    { type: "test:pass", data: { name: "d", file: "c.test.js", skip: "no local mongod" } },
    { type: "test:diagnostic", data: { message: "tests 5" } },
  ));

  assert.deepEqual(totals, { passed: 2, failed: 1, skipped: 1 });
});

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
    // for a recursive call and runs nothing. And without the summary file: in
    // CI the child would add its deliberate skip to the real run's summary.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.GITHUB_STEP_SUMMARY;
    delete env.GITHUB_ACTIONS;

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
    assert.doesNotMatch(clean.stdout, /::notice/, "no GitHub notices off GitHub");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The totals, from a real run, written where GitHub reads them - and agreeing
// with node's own count of the same run.
test("on GitHub it reports the totals on the summary page and as a notice", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fail-on-skip-"));
  try {
    const file = path.join(dir, "mixed.test.mjs");
    fs.writeFileSync(file, [
      'import test, { describe, it } from "node:test";',
      'test("one", () => {});',
      'describe("a group", () => { it("two", () => {}); it("three", () => {}); });',
      'test("with a subtest", async (t) => { await t.test("four", () => {}); });',
    ].join("\n"));
    const summary = path.join(dir, "summary.md");

    const env = { ...process.env, GITHUB_STEP_SUMMARY: summary, GITHUB_ACTIONS: "true" };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--test",
      "--test-reporter=spec", "--test-reporter-destination=stdout",
      `--test-reporter=${REPORTER}`, "--test-reporter-destination=stderr",
      file,
    ], { encoding: "utf8", env });

    assert.equal(result.status, 0, result.stderr);
    const nodeCount = Number(/tests (\d+)/.exec(result.stdout)[1]);
    assert.equal(
      fs.readFileSync(summary, "utf8"),
      `**Server tests:** ${nodeCount} passed, 0 failed, 0 skipped\n`
    );
    assert.match(
      result.stdout,
      new RegExp(`^::notice title=Server tests::${nodeCount} passed, 0 failed, 0 skipped$`, "m")
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

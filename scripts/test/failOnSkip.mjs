// A node:test reporter that fails the run if any test was skipped.
//
// Every database-backed test skips itself when no MongoDB is listening, which
// is right on a laptop - the rest of the suite still runs - and exactly wrong
// in CI. A job whose database never came up would go green having skipped the
// route, scoring and pool tests: most of what matters. Rather than teach 23
// files a second way to behave, CI adds this reporter beside the usual one and
// any skip, for that reason or a future one, fails the run and is named.
//
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//               --test-reporter=./scripts/test/failOnSkip.mjs \
//               --test-reporter-destination=stderr ...
//
// That is `npm run test:server:ci`. Plain `npm test` does not use it.
//
// On GitHub it also writes the totals to the run's summary page. The step
// logs are only visible to someone signed in; the summary is visible to
// anyone, so "every test ran and none skipped" can be seen at a glance.

import fs from "node:fs";
import path from "node:path";

// Skipped tests arrive as test:pass events with `skip` set - to true, or to
// the reason given to t.skip(). Suites (describe blocks) are not tests, and
// are left out of the counts as node's own summary leaves them out.
export async function* reportSkips(source, fail, summarise = () => {}) {
  const skipped = [];
  let passed = 0;
  let failed = 0;

  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const { skip, name, file, details } = event.data;
    if (details && details.type === "suite") continue;

    if (event.type === "test:fail") {
      failed += 1;
      continue;
    }
    if (skip === undefined || skip === false) {
      passed += 1;
      continue;
    }

    const where = file ? path.relative(process.cwd(), file) : "(unknown file)";
    skipped.push(
      `  - ${where}: ${name}${typeof skip === "string" ? ` (${skip})` : ""}`
    );
  }

  summarise({ passed, failed, skipped: skipped.length });

  if (!skipped.length) return;

  fail();
  yield (
    `\n${skipped.length} test${skipped.length === 1 ? " was" : "s were"} ` +
    "skipped, and this run does not allow skips:\n" +
    `${skipped.join("\n")}\n\n` +
    "Most likely MongoDB was not reachable. Every database-backed test skips\n" +
    "itself without one, so a green run here would have tested far less than\n" +
    "it claims.\n"
  );
}

// GitHub's job summary: a markdown file the runner names in this variable.
const writeSummary = ({ passed, failed, skipped }) => {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  fs.appendFileSync(
    file,
    `**Server tests:** ${passed} passed, ${failed} failed, ${skipped} skipped\n`
  );
};

// Set rather than thrown, so the report above is written first. The test
// runner only ever raises the exit code for a failure, never lowers it.
export default (source) =>
  reportSkips(
    source,
    () => {
      process.exitCode = 1;
    },
    writeSummary
  );

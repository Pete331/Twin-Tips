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

import path from "node:path";

// Skipped tests arrive as test:pass events with `skip` set - to true, or to
// the reason given to t.skip().
export async function* reportSkips(source, fail) {
  const skipped = [];

  for await (const event of source) {
    if (event.type !== "test:pass") continue;
    const { skip, name, file } = event.data;
    if (skip === undefined || skip === false) continue;

    const where = file ? path.relative(process.cwd(), file) : "(unknown file)";
    skipped.push(
      `  - ${where}: ${name}${typeof skip === "string" ? ` (${skip})` : ""}`
    );
  }

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

// Set rather than thrown, so the report above is written first. The test
// runner only ever raises the exit code for a failure, never lowers it.
export default (source) =>
  reportSkips(source, () => {
    process.exitCode = 1;
  });

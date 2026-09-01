// Checks the odds-feed name table against the teams actually stored.
//
//   node scripts/auditOddsTeams.js
//
// The unit tests prove the table is internally consistent - eighteen clubs,
// every alias resolving, unknown names refused. They cannot prove it still
// matches the database, because they deliberately touch nothing. This does.
//
// Worth running when a club is added, renamed or relocated: the failure mode
// otherwise is odds quietly missing from a fixture, with nothing raised and
// nothing logged.
const mongoose = require("mongoose");
require("dotenv").config();

const { auditAgainstTeams } = require("../services/oddsTeams");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";

(async () => {
  await mongoose.connect(MONGODB_URI);

  const report = await auditAgainstTeams();

  console.log(`  teams in the database : ${report.teams}`);
  console.log(`  teams in the table    : ${report.mapped}`);

  if (report.missing.length) {
    console.log(`\n  in the database, not in the table:`);
    report.missing.forEach((t) => console.log(`    ${t}`));
  }

  if (report.unknownName.length) {
    console.log(`\n  mapped, but the stored name does not resolve to them:`);
    report.unknownName.forEach((t) => console.log(`    ${t}`));
  }

  if (report.extra.length) {
    console.log(`\n  in the table, not in the database: ${report.extra.join(", ")}`);
  }

  console.log(
    report.ok
      ? "\n  every club maps both ways"
      : "\n  the table and the database disagree - odds would be dropped for the clubs above"
  );

  await mongoose.disconnect();
  process.exit(report.ok ? 0 : 1);
})().catch(async (err) => {
  console.error("  audit failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

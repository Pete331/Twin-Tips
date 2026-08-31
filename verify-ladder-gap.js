// Throwaway, read-only. Measures the window between tipping for round N+1
// opening (the last kick-off of round N) and round N's ladder snapshot being
// written. Anyone tipping inside that window is judged against round N-1's
// ladder instead of round N's.
require("dotenv").config();
const mongoose = require("mongoose");
const db = require("./models");

const hours = (ms) => (ms / 3600000).toFixed(1);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const year = Number(process.argv[2]) || new Date().getFullYear();

  const fixtures = await db.Fixture.find({ year }).sort({ date: 1 }).lean();
  if (!fixtures.length) {
    console.log(`no fixtures for ${year}`);
    return mongoose.disconnect();
  }

  const byRound = new Map();
  for (const f of fixtures) {
    if (!byRound.has(f.round)) byRound.set(f.round, []);
    byRound.get(f.round).push(f);
  }

  // First snapshot row written for each round.
  const snaps = await db.Standing.find({ year })
    .select("round created_at")
    .sort({ created_at: 1 })
    .lean();
  const firstSnap = new Map();
  for (const s of snaps) {
    if (!firstSnap.has(s.round)) firstSnap.set(s.round, s.created_at);
  }

  console.log(`\n${year}: round | last bounce | complete | snapshot written | gap`);
  console.log("".padEnd(78, "-"));

  const gaps = [];
  for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
    const games = byRound.get(round);
    const isFinals = games.some((g) => Number(g.is_final) !== 0);
    const complete = games.every((g) => Number(g.complete) === 100);
    const lastBounce = games
      .map((g) => g.date)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];
    const snap = firstSnap.get(round);

    // Tipping for round+1 opens at this round's last bounce.
    const gap = snap && lastBounce ? snap - lastBounce : null;
    if (gap !== null && gap > 0 && !isFinals) gaps.push({ round, gap });

    console.log(
      `${String(round).padStart(5)} | ` +
        `${lastBounce ? lastBounce.toISOString().slice(0, 16) : "-".padEnd(16)} | ` +
        `${String(complete).padEnd(8)} | ` +
        `${snap ? snap.toISOString().slice(0, 16) : "none".padEnd(16)} | ` +
        `${gap === null ? "-" : hours(gap) + "h"}${isFinals ? "  (finals)" : ""}`
    );
  }

  if (gaps.length) {
    const total = gaps.reduce((a, g) => a + g.gap, 0);
    const worst = gaps.reduce((a, g) => (g.gap > a.gap ? g : a));
    console.log(
      `\n${gaps.length} rounds opened tipping before their ladder existed.` +
        ` mean ${hours(total / gaps.length)}h, worst ${hours(worst.gap)}h (round ${worst.round}).`
    );
  } else {
    console.log("\nNo gaps found.");
  }

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

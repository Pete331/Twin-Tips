// Throwaway, read-only. Runs the real getSeasonState against Atlas so the new
// rollover and ladder-gate logic can be seen on live data.
require("dotenv").config();
const mongoose = require("mongoose");
const season = require("./services/season");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const state = await season.getSeasonState();

  const show = [
    "season",
    "currentRound",
    "roundName",
    "isFinals",
    "tippingOpen",
    "ladderReady",
    "homeAndAwayComplete",
    "seasonComplete",
    "lockout",
    "lastHomeAndAwayRound",
    "lastCompletedRound",
  ];
  for (const key of show) console.log(`  ${key.padEnd(21)} ${state[key]}`);
  console.log(`  ${"message".padEnd(21)} ${state.message || "(none)"}`);
  console.log(`  ${"serverTime".padEnd(21)} ${state.serverTime.toISOString()}`);

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

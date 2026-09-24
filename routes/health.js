// GET /api/health - whether this instance can do its job.
//
// Render calls this before sending traffic to a new deploy (healthCheckPath in
// render.yaml), so a build that starts but cannot reach the database is held
// back rather than replacing one that works. Without it Render only knew the
// port had opened. It is also what an outside pinger can hit to stop the free
// instance falling asleep.
//
// Open to anyone, and says nothing beyond whether the database is connected.
// readyState rather than a ping: Render asks every few seconds, and the
// driver already tracks the connection without a round trip to Atlas.

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/", (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  // A health check answered from a cache is not a health check.
  res.set("Cache-Control", "no-store");
  res.status(connected ? 200 : 503).json({
    ok: connected,
    database: connected ? "connected" : "unavailable",
  });
});

module.exports = router;

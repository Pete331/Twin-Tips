// Every API route, mounted on an app - the one list of them.
//
// It lived in server.js, inline in start(). It moved here so that the test
// checking every call the client makes has a route to answer it
// (client/src/utils/apiRoutes.test.jsx) reads the same table the server
// serves, rather than a copy of it that could drift.
//
// The health check is not here: server.js mounts it ahead of sessions and
// sign-in, so health checks never touch the session store.
const mountApi = (app) => {
  app.use("/api/auth", require("./api/auth"));
  app.use("/api/squiggle", require("./squiggle"));
  app.use("/api/season", require("./season"));
  app.use("/api/leagues", require("./leagues"));
  app.use("/api/ladder", require("./ladder"));
  app.use("/api/odds", require("./odds"));
  app.use("/api/contact", require("./contact"));

  require("./api-routes.js")(app);

  // Anything under /api that got this far does not exist, and has to say so in
  // the shape the client parses. Without this it falls through to the app
  // shell and answers 200 with HTML: axios sees a success status, no catch
  // block runs anywhere, and the calling code carries on with a page of markup
  // where it expected data. Registered after every API route so it only
  // catches what nothing else claimed.
  app.use("/api", function (req, res) {
    res.status(404).json({ success: false, message: "No such API route." });
  });
};

module.exports = { mountApi };

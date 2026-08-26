const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const passport = require("passport");
// connect-mongo 6 exports named members; v5 and earlier exported the store
// directly, which is what most examples still show.
const { MongoStore } = require("connect-mongo");
require("dotenv").config();

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TWO_WEEKS_MS = 1209600000;
const app = express();

// A missing secret in production would silently fall back to a value sitting
// in public source control, and anyone reading it could forge a session
// cookie. Refuse to start instead.
if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET must be set when NODE_ENV=production.");
  process.exit(1);
}

if (IS_PRODUCTION) {
  // Render terminates TLS at its proxy and forwards over plain HTTP, so
  // without this Express sees an insecure request, refuses to send a
  // cookie marked secure, and every login silently fails to stick.
  app.set("trust proxy", 1);
}

// Serve the built client whenever a build exists, rather than only when
// NODE_ENV says production. Checking a production build used to mean setting
// NODE_ENV=production locally, which now also demands a secure cookie that a
// browser will not store over plain http - so signing in would be impossible
// and the check worthless. Serving the build on its own merits keeps that
// possible without loosening anything in production.
//
// __dirname rather than a relative path: express.static resolves relative
// paths against the working directory, which is only the repo root by
// convention.
const CLIENT_BUILD = path.join(__dirname, "client/build");
if (fs.existsSync(CLIENT_BUILD)) {
  app.use(express.static(CLIENT_BUILD));
}

// Parse application body as JSON
app.use(
  express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 })
);
app.use(express.json());

// Mongoose must connect before the session store is built, so the store can
// reuse mongoose's MongoClient rather than opening a second connection pool.
async function start() {
  await mongoose.connect(MONGODB_URI);

  // We need to use sessions to keep track of our user's login status
  app.use(
    session({
      // saveUninitialized wrote a session document for every visitor, signed
      // in or not, so crawlers alone would grow the collection without limit.
      // resave rewrote unchanged sessions on every request; MongoStore
      // implements touch, so expiry still gets extended without it.
      resave: false,
      saveUninitialized: false,
      secret: process.env.SESSION_SECRET || "itsNoSecret",
      cookie: {
        maxAge: TWO_WEEKS_MS,
        httpOnly: true,
        // Only over HTTPS in production. Locally this has to stay off, or the
        // cookie is never set over plain http and login cannot work at all.
        secure: IS_PRODUCTION,
        // Lax still sends the cookie on top-level navigation, so following a
        // password reset link back into the app keeps you signed in.
        sameSite: "lax",
      },
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        // Matches the cookie. At the previous 24 hours the server forgot the
        // session a fortnight before the browser stopped presenting it, so a
        // user was quietly logged out after a day.
        ttl: TWO_WEEKS_MS / 1000,
      }),
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  app.use("/api/auth", require("./routes/api/auth"));
  app.use("/api/squiggle", require("./routes/squiggle"));
  app.use("/api/season", require("./routes/season"));

  // Import routes and give the server access to them.
  require("./routes/api-routes.js")(app);
  // require("./routes/html-routes.js")(app);

  // Send every request to the React app
  // Define any API routes before this runs
  //
  // "/*splat" rather than "*": Express 5 matches paths with path-to-regexp 8,
  // where a bare "*" is no longer a valid pattern and wildcards have to be
  // named. Left as "*" this route simply never matches, and every client-side
  // route 404s.
  app.get("/*splat", function (req, res) {
    // A request for a file that isn't there must 404, not fall through to the
    // app shell. Otherwise a missing image answers 200 with HTML, the browser
    // tries to render markup as an SVG, and you get a broken image with
    // nothing in the network tab to explain it - which is exactly how a
    // renamed team logo stayed hidden.
    if (/\.[a-z0-9]+$/i.test(req.path)) {
      return res.status(404).send("Not found");
    }
    res.sendFile(path.join(__dirname, "./client/build/index.html"));
  });

  app.listen(PORT, function () {
    console.log(`🌎 ==> API server now on port ${PORT}!`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

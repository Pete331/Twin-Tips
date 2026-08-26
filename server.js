const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const helmet = require("helmet");
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

// Checked here rather than where the mail is sent, because that is a runtime
// path nobody exercises until a user is already locked out. The reset email
// carries an absolute link, and it used to be built from a value committed to
// this repo that still pointed at the old Heroku host - so the mail sent, the
// API answered 200, and the link went nowhere.
if (IS_PRODUCTION && !process.env.APP_URL) {
  console.error(
    "APP_URL must be set when NODE_ENV=production - password reset emails " +
      "link to it."
  );
  process.exit(1);
}

if (IS_PRODUCTION) {
  // Render terminates TLS at its proxy and forwards over plain HTTP, so
  // without this Express sees an insecure request, refuses to send a
  // cookie marked secure, and every login silently fails to stick.
  //
  // It is also what makes the rate limiters count the real client rather than
  // the proxy, which would otherwise look like one very busy visitor.
  app.set("trust proxy", 1);
}

// Security response headers. Sets sensible defaults for the ones that cost
// nothing - nosniff, frame denial, a strict referrer policy - and a content
// security policy tuned to what this app actually loads.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Materialize still comes from cdnjs, and the layout genuinely depends
        // on it - disabling that stylesheet moves 77 of 84 elements on the
        // dashboard. 'unsafe-inline' is required because emotion injects the
        // component styles as inline <style> tags at runtime; removing it
        // would leave the app unstyled.
        styleSrc: ["'self'", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
        // No exception for toptal.com, which global.css names as the page
        // background texture: that URL has answered 404 for some time, so the
        // background already falls back to its colour and nothing renders
        // differently. Blocking it here means the browser stops making the
        // doomed request - and stops announcing every visitor to a third party
        // for an image that does not exist. The dead reference in
        // client/src/components/App/global.css is worth removing on its own.
        imgSrc: ["'self'", "data:"],
        // Only our own origin: the browser talks to Squiggle through this
        // server, never directly.
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // The app is same-origin throughout; the default would block the CDN
    // stylesheet.
    crossOriginEmbedderPolicy: false,
  })
);

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

// Parse application body as JSON.
//
// The 50mb limit and 50000 parameters were sized for the browser posting whole
// seasons of fixture data back to the server. That path is gone, and nothing
// left accepts a body bigger than a handful of fields - so the old ceiling was
// just an easy way for one request to make the server allocate 50mb.
app.use(express.urlencoded({ limit: "100kb", extended: true }));
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

  // Anything under /api that got this far does not exist, and has to say so in
  // the shape the client parses. Without this it falls through to the app
  // shell below and answers 200 with HTML: axios sees a success status, no
  // catch block runs anywhere, and the calling code carries on with a page of
  // markup where it expected data. Registered after every API route so it only
  // catches what nothing else claimed.
  app.use("/api", function (req, res) {
    res.status(404).json({ success: false, message: "No such API route." });
  });

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

  // Last, and four arguments so Express recognises it as the error handler.
  //
  // Express 5 forwards a rejected promise from an async handler here by
  // itself, which 4 did not - it left the request hanging. Without a handler
  // registered, though, anything escaping a route's own try/catch reaches the
  // built-in one and answers with an HTML error page, which is the wrong shape
  // for every caller this app has. The message is deliberately not echoed
  // back: it can carry connection strings and fragments of the query.
  app.use(function (err, req, res, next) {
    console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);

    if (res.headersSent) {
      return next(err);
    }

    // Some errors already know they are the caller's fault - body-parser marks
    // unparseable JSON as 400. Answering 500 to those blames the server for
    // bad input, and buries real faults among them in any log or dashboard.
    const status = err.status || err.statusCode;
    const clientError = Number.isInteger(status) && status >= 400 && status < 500;

    res.status(clientError ? status : 500).json({
      success: false,
      message: clientError
        ? "That request could not be understood."
        : "Something went wrong on our end.",
    });
  });

  app.listen(PORT, function () {
    console.log(`🌎 ==> API server now on port ${PORT}!`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

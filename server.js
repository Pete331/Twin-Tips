const express = require("express");
const session = require("express-session");
const path = require("path");
const mongoose = require("mongoose");
const passport = require("passport");
// connect-mongo 6 exports named members; v5 and earlier exported the store
// directly, which is what most examples still show.
const { MongoStore } = require("connect-mongo");
require("dotenv").config();

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips";
const app = express();

// Serve up static assets (usually on heroku)
if (process.env.NODE_ENV === "production") {
  app.use(express.static("client/build"));
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
      resave: true,
      saveUninitialized: true,
      secret: process.env.SESSION_SECRET || "itsNoSecret",
      cookie: { maxAge: 1209600000 }, // two weeks in milliseconds
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        ttl: 24 * 60 * 60, //time to store cookies
      }),
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  app.use("/api/auth", require("./routes/api/auth"));
  app.use("/api/squiggle", require("./routes/squiggle"));

  // Import routes and give the server access to them.
  require("./routes/api-routes.js")(app);
  // require("./routes/html-routes.js")(app);

  // Send every request to the React app
  // Define any API routes before this runs
  app.get("*", function (req, res) {
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

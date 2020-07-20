const express = require("express");
const session = require("express-session");
const path = require("path");
const mongoose = require("mongoose");
const passport = require("passport");
const MongoStore = require("connect-mongo")(session);
require("dotenv").config();

const PORT = process.env.PORT || 3001;
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

// We need to use sessions to keep track of our user's login status
app.use(
  session({
    resave: true,
    saveUninitialized: true,
    secret: "itsNoSecret", // process.env.SESSION_SECRET
    cookie: { maxAge: 1209600000 }, // two weeks in milliseconds
    store: new MongoStore({
      mongooseConnection: mongoose.connection,
      ttl: 24 * 60 * 60, //time to store cookies
    }),
  })
);

app.use(passport.initialize());
app.use(passport.session());



mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost/twin-tips", { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false });

app.use("/api/auth", require("./routes/api/auth"));

// Import routes and give the server access to them.
require("./routes/api-routes.js")(app);
// require("./routes/html-routes.js")(app);

// Send every request to the React app
// Define any API routes before this runs
app.get("*", function(req, res) {
  res.sendFile(path.join(__dirname, "./client/build/index.html"));
});

app.listen(PORT, function() {
  console.log(`🌎 ==> API server now on port ${PORT}!`);
});

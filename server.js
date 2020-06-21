const express = require('express');
const session = require("express-session");
const logger = require("morgan");
const mongoose = require("mongoose");
const passport = require('passport');
const passportConfig  = require("./config/passport");
const MongoStore = require('connect-mongo')(session);
require('dotenv').config();

const PORT = process.env.PORT || 3000;

const app = express();

app.use(logger("dev"));

// Serve static content for the app from the "public" directory in the application directory.
app.use(express.static("public"));

// Parse application body as JSON
app.use(express.urlencoded({limit: '50mb', extended: true, parameterLimit:50000 }));
app.use(express.json());

// We need to use sessions to keep track of our user's login status
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  cookie: { maxAge: 1209600000 }, // two weeks in milliseconds
  store: new MongoStore({
    url: process.env.MONGODB_URI,
    autoReconnect: true,
  })
}));
app.use(passport.initialize());
app.use(passport.session());


// Set Handlebars.
const exphbs = require("express-handlebars");

const hbs = exphbs.create({
  helpers: {
    // prettifyDate: function (date, format) {
    //   var mmnt = moment(date);
    //   return mmnt.format(format);
    // },
  },
});

app.engine("handlebars",  hbs.engine);
app.set("view engine", "handlebars");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/twin-tips"

mongoose.connect(MONGODB_URI)

// mongoose.connect("mongodb://localhost/workout", {
//   useNewUrlParser: true,
//   useFindAndModify: false,
//   useUnifiedTopology: true
// });

// Import routes and give the server access to them.
require("./routes/api-routes.js")(app);
require("./routes/html-routes.js")(app);

// Start our server so that it can begin listening to client requests.
app.listen(PORT, function() {
  // Log (server-side) when our server has started
  console.log("Server listening on: http://localhost:" + PORT);
});

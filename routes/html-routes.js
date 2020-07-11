const path = require("path");
// const isAuthenticated = require("../config/middleware/isAuthenticated");

module.exports = function(app){ 
  app.get("/", function(req, res) {
    res.render("index");
  });

  app.get("/signup", function(req, res) {
    res.render("signup");
  });

  app.get("/dashboard", function(req, res) {
    res.render("dashboard");
  });
}


const path = require("path");
const db = require("../models");
// const isAuthenticated = require("../config/middleware/isAuthenticated");

module.exports = function (app) {
  app.get("/", function (req, res) {
    res.render("index");
  });

  app.get("/signup", function (req, res) {
    res.render("signup");
  });

  app.get("/dashboard", function (req, res) {
    res.render("dashboard");
  });

  app.get("/fixture", function (req, res) {
    db.Fixture.find({})
      .then((data) => {
        console.log(data);
        // res.json(data);
        res.render("fixture", {data});
      })
      .catch((err) => {
        res.json(err);
      });
    
  });
};

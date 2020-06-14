let db = require("../models");

module.exports = function (app) {
  //   fills fixtures in database
  app.post("/api/fixtures", function (req, res) {
    const apiData = req.body.games;
    console.log(apiData);
    db.Fixture.create({ games: apiData })
      .then((data) => res.json(data))
      .catch((err) => {
        res.json(err);
      });
  });

  // gets winning teams
  app.get("/api/winners", function (req, res) {
    console.log("Hitting this");
    db.Fixture.find({  })
      .then((data) => {
        console.log(data);
        res.json(data);
      })
      .catch((err) => {
        res.json(err);
      });
  });
};

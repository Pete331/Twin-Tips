$(document).ready(function () {
  const season = "2020";
  const round = "1";

  $("#download-fixture").on("click", () => {
    const gamesUrl = `https://api.squiggle.com.au/?q=games;year=${season};round=${round}`;
    $.getJSON(gamesUrl, function (json) {
      console.log(json);

      $.ajax("/api/fixtures", {
        type: "POST",
        data: json,
      }).then(function () {
        console.log("Imported fixtures");
        // Reload the page to get the updated list
        // location.reload();
      });
    });
  });

  $("#download-teams").on("click", () => {
    const teamsUrl = "https://api.squiggle.com.au/?q=teams";
    $.getJSON(teamsUrl, function (json) {
      console.log(json);

      $.ajax("/api/teams", {
        type: "POST",
        data: json,
      }).then(function () {
        console.log("Imported teams");
      });
    });
  });

  $("#download-standings").on("click", () => {
    const teamsUrl = `https://api.squiggle.com.au/?q=standings;round=${round}`;
    $.getJSON(teamsUrl, function (json) {
      console.log(json);

      $.ajax("/api/standings", {
        type: "POST",
        data: json,
      }).then(function () {
        console.log("Imported standings");
      });
    });
  });

  $("#winning-teams").on("click", () => {
    fetch("/api/winners").then((response) => {
      console.log(response);
      return response.json();
    });
  });

  $("#fixture-details").on("click", () => {
    fetch("/api/details")
      .then((response) => {
        // The response is a Response instance.
        // You parse the data into a useable format using `.json()`
        return response.json();
      })
      .then((data) => {
        // `data` is the parsed version of the JSON returned from the above endpoint.
        console.log(data);
      });
  });
});

import React from "react";
import Button from "@material-ui/core/Button";
import API from "../../utils/TipsAPI";

const AdminComponent = () => {
  function getFixture() {
    API.getFixture()
      .then((results) => {
        console.log(results.data);
        API.postFixture(results.data);
      })
      .catch((err) => console.log(err));
  }

  function getTeams() {
    API.getTeams()
      .then((results) => {
        console.log(results.data);
        API.postTeams(results.data);
      })
      .catch((err) => console.log(err));
  }

  function getStandings() {
    API.getStandings()
      .then((results) => {
        console.log(results.data);
        API.postStandings(results.data);
      })
      .catch((err) => console.log(err));
  }

  function getDetails() {
    API.getDetails()
      .then((results) => {
        console.log(results.data);
      })
      .catch((err) => console.log(err));
  }

  return (
    <div>
      <Button variant="contained" color="primary" onClick={getFixture}>
        Download Fixtures
      </Button>
      <Button variant="contained" color="primary" onClick={getTeams}>
        Download Teams
      </Button>
      <Button variant="contained" color="primary" onClick={getStandings}>
        Download Standings
      </Button>
      <Button variant="contained" color="primary" onClick={getDetails}>
        Fixtures with team details
      </Button>
    </div>
  );
};

export default AdminComponent;

import React, { useEffect } from "react";
import API from "../utils/API";

function Dashboard() {
  //   useEffect(() => {
  //     getOdds();
  //   }, []);

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
      <button className="btn btn-primary" onClick={getFixture}>
        Download Fixtures
      </button>
      <button onClick={getTeams} className="btn btn-primary">
        Download Teams
      </button>
      <button onClick={getStandings} className="btn btn-primary">Download Standings</button>
      <button className="btn btn-primary">Winning Teams</button>
      <button onClick={getDetails} className="btn btn-primary">Fixtures with team details</button>
    </div>
  );
}
export default Dashboard;

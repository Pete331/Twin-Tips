import React, { useState } from "react";
import Button from "@material-ui/core/Button";
import API from "../../utils/TipsAPI";
import TextField from "@material-ui/core/TextField";
import calcResults from "../../utils/roundResultCalc";

const AdminComponent = () => {
  const [roundCalculation, setRoundCalculation] = useState();

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

  function handleRoundChangeForDownload(event) {
    setRoundCalculation({ round: Number(event.target.value) });
  }

  function handleCalcResults() {
    calcResults(roundCalculation);
    // window.location.reload();
  }

  return (
    <div>
      <h3>Admin Tools</h3>
      <p>Manually download fixtures/results</p>
      <Button variant="contained" color="primary" onClick={getFixture}>
        Download Fixtures
      </Button>
      <p>function run after the completion of each round</p>
      <Button variant="contained" color="primary" onClick={getStandings}>
        Download Standings
      </Button>
      <p>function that calculates tipsters results for the round</p>
      <Button
        variant="contained"
        color="primary"
        onClick={() => handleCalcResults()}
      >
        Calculate Results
      </Button>{" "}
      <TextField
        label="Round"
        variant="outlined"
        type="number"
        onChange={handleRoundChangeForDownload}
        inputProps={{
          min: 0,
          max: 22,
          style: { textAlign: "center" },
        }}
        style={{ width: 80 }}
      />
      <p>Only required once - Downloads team information(logos, names etc)</p>
      <Button variant="contained" color="primary" onClick={getTeams}>
        Download Teams
      </Button>
    </div>
  );
};

export default AdminComponent;

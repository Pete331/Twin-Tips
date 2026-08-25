import React, { useState, useContext } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import SeasonAPI from "../../utils/SeasonAPI";
import { SeasonContext } from "../../utils/SeasonContext";
import calcResults from "../../utils/roundResultCalc";

const AdminComponent = () => {
  const { seasonState } = useContext(SeasonContext);
  const [roundCalculation, setRoundCalculation] = useState();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Fixtures, teams and ladder snapshots used to be three separate buttons that
  // each downloaded from Squiggle in the browser and POSTed the result back to
  // endpoints beginning with deleteMany. Squiggle refuses browser requests now,
  // and that pattern let the client rewrite shared data. One call to the server
  // does all three - see services/seasonSync.js.
  function syncSeason() {
    if (!seasonState) return;
    setSyncing(true);
    setSyncResult(null);

    SeasonAPI.sync(seasonState.season)
      .then((res) => {
        const { games, teams, ladders } = res.data;
        setSyncResult(
          `${games} games, ${teams} teams, ` +
            `${ladders.captured} new ladder snapshot(s) ` +
            `(${ladders.completed} completed rounds).`
        );
      })
      .catch((err) => {
        const message =
          err.response && err.response.data && err.response.data.message
            ? err.response.data.message
            : "Sync failed.";
        setSyncResult(message);
      })
      .finally(() => setSyncing(false));
  }

  function handleRoundChangeForDownload(event) {
    setRoundCalculation({ round: Number(event.target.value) });
  }

  function handleCalcResults() {
    calcResults(roundCalculation);
  }

  return (
    <div>
      <h5>Admin Tools</h5>
      <p>
        Pulls fixtures, teams and a ladder snapshot for every completed round of{" "}
        {seasonState ? seasonState.season : "the current season"} from Squiggle.
        Normally runs on a schedule; this is the manual trigger.
      </p>
      <Button
        variant="contained"
        color="primary"
        onClick={syncSeason}
        disabled={syncing || !seasonState}
      >
        {syncing ? "Syncing..." : "Sync season from Squiggle"}
      </Button>
      {syncResult ? <p>{syncResult}</p> : ""}

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
          // Bounds follow the season instead of a hardcoded 22.
          min: seasonState && seasonState.firstRound !== null ? seasonState.firstRound : 0,
          max:
            seasonState && seasonState.currentRound !== null
              ? seasonState.currentRound
              : 30,
          style: { textAlign: "center" },
        }}
        style={{ width: 80 }}
      />
    </div>
  );
};

export default AdminComponent;

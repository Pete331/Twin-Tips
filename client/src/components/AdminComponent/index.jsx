import React, { useState, useContext } from "react";
import Button from "@material-ui/core/Button";
import SeasonAPI from "../../utils/SeasonAPI";
import { SeasonContext } from "../../utils/SeasonContext";

const AdminComponent = () => {
  const { seasonState } = useContext(SeasonContext);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Fixtures, teams, ladder snapshots and now scoring used to be separate
  // buttons that each downloaded from Squiggle in the browser and POSTed the
  // result back to endpoints beginning with deleteMany. Squiggle refuses
  // browser requests now, and that pattern let any client rewrite shared data
  // and everyone's results. One call to the server does the lot - see
  // services/seasonSync.js.
  function syncSeason() {
    if (!seasonState) return;
    setSyncing(true);
    setSyncResult(null);

    SeasonAPI.sync(seasonState.season)
      .then((res) => {
        const { games, teams, ladders, scored } = res.data;
        setSyncResult(
          `${games} games, ${teams} teams, ` +
            `${ladders.captured} new ladder snapshot(s), ` +
            `${scored.scored} tip(s) scored across ${scored.rounds} round(s).`
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

  return (
    <div>
      <h5>Admin Tools</h5>
      <p>
        Pulls fixtures, teams and a ladder snapshot for every completed round of{" "}
        {seasonState ? seasonState.season : "the current season"} from Squiggle,
        then scores the rounds that have finished. Normally runs on a schedule;
        this is the manual trigger.
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
    </div>
  );
};

export default AdminComponent;

import { useState, useEffect, useContext } from "react";
import Button from "@mui/material/Button";
import { dateAndTime } from "../../utils/dates";
import SeasonAPI from "../../utils/SeasonAPI";
import { SeasonContext } from "../../utils/SeasonContext";
import Typography from "@mui/material/Typography";

// Turns [0,1,2,3,7,8] into "0-3, 7-8" so a whole season's rounds fit on a line.
const summariseRounds = (rounds) => {
  if (!rounds || !rounds.length) return "none";
  const sorted = [...rounds].sort((a, b) => a - b);
  const spans = [];
  let start = sorted[0];
  let previous = sorted[0];

  sorted.slice(1).forEach((value) => {
    if (value !== previous + 1) {
      spans.push([start, previous]);
      start = value;
    }
    previous = value;
  });
  spans.push([start, previous]);

  return spans.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
};

const AdminComponent = () => {
  const { seasonState } = useContext(SeasonContext);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [status, setStatus] = useState(null);

  const loadStatus = () => {
    SeasonAPI.getStatus()
      .then((res) => setStatus(res.data))
      .catch((err) => console.log(err));
  };

  useEffect(loadStatus, []);

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
      .finally(() => {
        setSyncing(false);
        // Refresh the status line so the button's effect is visible.
        loadStatus();
      });
  }

  const when = (value) =>
    value ? dateAndTime(value) : "not since timestamps were added";

  return (
    <div>
      <Typography variant="h6" component="h2" gutterBottom>
        Admin Tools
      </Typography>

      {/* Enough to tell at a glance whether the scheduled sync is running,
          without going to the server logs. */}
      {status ? (
        <p style={{ marginBottom: "4px" }}>
          <strong>{status.season}</strong> &middot; fixtures updated{" "}
          {when(status.fixturesUpdated)} &middot; ladders updated{" "}
          {when(status.laddersUpdated)}
          <br />
          ladder snapshots for round(s) {summariseRounds(status.ladderRounds)}{" "}
          &middot; scored round(s) {summariseRounds(status.scoredRounds)}
        </p>
      ) : (
        ""
      )}

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

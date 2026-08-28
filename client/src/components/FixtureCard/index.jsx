import FixtureCenterCard from "../FixtureCenterCard";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";

const FixtureCard = ({
  id,
  modelResults,
  venue,
  hteam,
  ateam,
  complete,
  hscore,
  ascore,
  winner,
  date,
  aabrev,
  habrev,
  hteamrank,
  ateamrank,
  handleSelectionChange,
  topEightSelection,
  bottomTenSelection,
  currentRound,
  round,
  lockout,
  lastRoundSelectionT8,
  lastRoundSelectionB10,
}) => {
  const getOrdinalNum = (number) => {
    let selector;

    if (number <= 0) {
      selector = 4;
    } else if ((number > 3 && number < 21) || number % 10 > 3) {
      selector = 0;
    } else {
      selector = number % 10;
    }

    return number + ["th", "st", "nd", "rd", ""][selector];
  };

  const homeOrdinal = getOrdinalNum(hteamrank);
  const awayOrdinal = getOrdinalNum(ateamrank);

  // Logo files are named after Squiggle's team abbreviation, which is a display
  // string they can change - it went from GC to GCS for Gold Coast, and the
  // logo silently broke. A new club would have no file at all. Hide the image
  // rather than leaving a broken-image icon; the team name is alongside it.
  const hideBrokenLogo = (event) => {
    event.target.style.display = "none";
  };

  // Finals fixtures exist before anyone knows who is in them: the semi-finals,
  // preliminary finals and grand final all carry empty team names and a null
  // team id. Render the fixture without pretending there is a team.
  const homeUndecided = !hteam;
  const awayUndecided = !ateam;
  const homeName = hteam || "To be decided";
  const awayName = ateam || "To be decided";

  let hcolor;
  let acolor;
  if (round === currentRound && hteamrank <= 8) {
    hcolor = "rgba(50,170,50,.3)";
  } else if (round === currentRound && hteamrank > 8) {
    hcolor = "rgb(170,0,0,.3)";
  }
  if (round === currentRound && ateamrank <= 8) {
    acolor = "rgba(50,170,50,.3)";
  } else if (round === currentRound && ateamrank > 8) {
    acolor = "rgb(170,0,0,.3)";
  }

  return (
    <div style={{ padding: "3px", height: "100%", width: "100%" }}>
      {/* This was gated on hteam, so a fixture whose teams are not yet decided
          rendered an empty div - the finals disappeared from the calendar
          rather than showing as upcoming. The card handles undecided sides
          now, so it only needs a fixture to exist. */}
      {id ? (
        <Grid container direction="row" align="center" sx={{
          alignItems: "stretch"
        }}>
          <Grid size={3}>
            <Card
              variant="outlined"
              sx={{ height: "100%", display: "flex", flexFlow: "column", flexGrow: 1 }}
            >
              <CardContent
                style={{
                  backgroundColor: hcolor,
                  padding: "2px",
                  height: "100%",
                }}
              >
                <Grid>
                  {homeUndecided ? (
                    ""
                  ) : (
                    <img
                      src={`/assets/team-logos/${habrev}.svg`}
                      alt={hteam}
                      onError={hideBrokenLogo}
                      style={{ maxWidth: "80px", height: "auto" }}
                    />
                  )}
                </Grid>
                {homeName} {"  "}
                {round === currentRound && !lockout ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        name={hteam}
                        onChange={handleSelectionChange}
                        value={hteamrank}
                        disabled={
                          lastRoundSelectionT8 === hteam ||
                          lastRoundSelectionB10 === hteam
                            ? true
                            : false
                        }
                        checked={
                          topEightSelection === hteam ||
                          bottomTenSelection === hteam
                        }
                      />
                    }
                  />
                ) : (
                  ""
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={6}>
            <Card variant="outlined" style={{ height: "100%", width: "100%" }}>
              {complete !== 0 ? (
                <FixtureCenterCard
                  aabrev={aabrev}
                  habrev={habrev}
                  venue={venue}
                  currentRound={currentRound}
                  round={round}
                  hsideattribute={hscore}
                  asideattribute={ascore}
                  winner={
                    complete === 100 && hscore === ascore
                      ? "Draw"
                      : complete === 100
                      ? `${winner} by ${Math.abs(hscore - ascore)}`
                      : hscore > ascore
                      ? `*${hteam} by ${Math.abs(hscore - ascore)}`
                      : `*${ateam} by ${Math.abs(hscore - ascore)}`
                  }
                  date={date}
                />
              ) : (
                <FixtureCenterCard
                  aabrev={aabrev}
                  habrev={habrev}
                  hteam={hteam}
                  ateam={ateam}
                  venue={venue}
                  hsideattribute={homeOrdinal.toString()}
                  asideattribute={awayOrdinal.toString()}
                  date={date}
                  currentRound={currentRound}
                  round={round}
                  id={id}
                  modelResults={modelResults}
                />
              )}
            </Card>
          </Grid>

          <Grid size={3}>
            <Card
              variant="outlined"
              sx={{ height: "100%", display: "flex", flexFlow: "column", flexGrow: 1 }}
            >
              <CardContent
                style={{
                  backgroundColor: acolor,
                  padding: "2px",
                  height: "100%",
                }}
              >
                <Grid>
                  {awayUndecided ? (
                    ""
                  ) : (
                    <img
                      src={`/assets/team-logos/${aabrev}.svg`}
                      alt={ateam}
                      onError={hideBrokenLogo}
                      style={{ maxWidth: "80px", height: "auto" }}
                    />
                  )}
                </Grid>
                {awayName}
                {"  "}
                {round === currentRound && !lockout ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        name={ateam}
                        onChange={handleSelectionChange}
                        value={ateamrank}
                        disabled={
                          lastRoundSelectionT8 === ateam ||
                          lastRoundSelectionB10 === ateam
                            ? true
                            : false
                        }
                        checked={
                          topEightSelection === ateam ||
                          bottomTenSelection === ateam
                        }
                      />
                    }
                  />
                ) : (
                  ""
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : (
        ""
      )}
    </div>
  );
};

export default FixtureCard;

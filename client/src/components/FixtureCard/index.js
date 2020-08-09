import React from "react";
import FixtureCenterCard from "../FixtureCenterCard";
import useStyles from "./style";
import Grid from "@material-ui/core/Grid";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";

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
  const classes = useStyles();

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
      {hteam ? (
        <Grid container direction="row" align="center" alignItems="stretch">
          <Grid item xs={3}>
            <Card variant="outlined" className={classes.fill}>
              <CardContent
                style={{
                  backgroundColor: hcolor,
                  padding: "2px",
                  height: "100%",
                }}
              >
                <Grid item>
                  <img
                    src={`./assets/team-logos/${habrev}.svg`}
                    alt={hteam}
                    style={{ maxWidth: "80px", height: "auto" }}
                  />
                </Grid>
                {hteam} {"  "}
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
                          topEightSelection === hteam
                            ? true
                            : false || bottomTenSelection === hteam
                            ? true
                            : false
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

          <Grid item xs={6}>
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
                    complete === 100
                      ? `${winner} by ${Math.abs(hscore - ascore)}`
                      : `Margin is currently ${Math.abs(
                          hscore - ascore
                        )} points`
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

          <Grid item xs={3}>
            <Card variant="outlined" className={classes.fill}>
              <CardContent
                style={{
                  backgroundColor: acolor,
                  padding: "2px",
                  height: "100%",
                }}
              >
                <Grid item>
                  <img
                    src={`./assets/team-logos/${aabrev}.svg`}
                    alt={ateam}
                    style={{ maxWidth: "80px", height: "auto" }}
                  />
                </Grid>
                {ateam}
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
                          topEightSelection === ateam
                            ? true
                            : false || bottomTenSelection === ateam
                            ? true
                            : false
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

import React from "react";
import FixtureCenterCard from "../FixtureCenterCard";
// import useStyles from "./style";
import Grid from "@material-ui/core/Grid";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";

const FixtureCard = ({
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
  hteamlogo,
  ateamlogo,
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
  //   const classes = useStyles();

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
    hcolor = "#50c878";
  } else if (round === currentRound && hteamrank > 8) {
    hcolor = "#FF4D4D";
  }
  if (round === currentRound && ateamrank <= 8) {
    acolor = "#50c878";
  } else if (round === currentRound && ateamrank > 8) {
    acolor = "#FF4D4D";
  }

  return (
    <div>
      <Grid container direction="row" alignItems="stretch" align="center">
        <Grid item xs={3}>
          <Card variant="outlined">
            <CardContent style={{ backgroundColor: hcolor }}>
              <Grid item>
                <img 
                  src={`./assets/team-logos/${habrev}.svg`}
                  alt={hteam}
                  style={{ width: "100px", height: "auto" }}
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

        <Grid item xs={6} container direction="column" alignItems="stretch">
          <Card variant="outlined">
            {complete === 100 ? (
              <FixtureCenterCard
                venue={venue}
                hsideattribute={hscore}
                asideattribute={ascore}
                winner={`${winner} won by ${Math.abs(hscore - ascore)} points`}
                date={date}
              />
            ) : (
              <FixtureCenterCard
                venue={venue}
                hsideattribute={homeOrdinal.toString()}
                asideattribute={awayOrdinal.toString()}
                date={date}
              />
            )}
          </Card>
        </Grid>
        <Grid item xs={3}>
          <Card variant="outlined">
            <CardContent style={{ backgroundColor: acolor }}>
              <Grid item>
                <img
                  src={`./assets/team-logos/${aabrev}.svg`}
                  alt={ateam}
                  style={{ width: "100px", height: "auto" }}
                />
              </Grid>
              {ateam}
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
    </div>
  );
};

export default FixtureCard;

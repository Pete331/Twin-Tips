import React from "react";
import Grid from "@mui/material/Grid";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import useStyles from "./style";
import Moment from "moment";


const FixtureCenterCard = ({
  venue,
  hsideattribute,
  asideattribute,
  winner,
  date,
  currentRound,
  round,
  modelResults,
  id,
  hteam,
  ateam,
  habrev,
  aabrev,
}) => {
  const classes = useStyles();

  let modelId = null;
  let homeConfidence = null;
  let margin = null;
  if (modelResults) {
    modelResults.map((game) => {
      if (game.gameid === id) {
        // console.log(modelResult);
        modelId = game.gameid;
        homeConfidence = game.hconfidence;
        margin = game.margin;
      }
      return game;
    });
  }

  return (
    <CardContent
      className={classes.justify}
      style={{ padding: "5px", height: "100%", width: "100%" }}
    >
      <Grid container spacing={0}>
        {/* Formatted in the reader's own timezone. These used to force
            utcOffset(300) - UTC+5, which is nowhere in Australia - so a game
            that bounced at 7:30pm in Melbourne read as 4:30pm to everyone,
            wherever they were. Left alone, moment uses the browser's zone, so
            Victoria sees 7:30pm and Perth sees 5:30pm for the same match. */}
        {/* MUI removed the Hidden component, so the short and long date forms
            are shown and hidden with sx breakpoints instead. "Hidden smUp"
            meant visible only below sm; "Hidden xsDown" meant visible from sm
            up. */}
        <Grid size={12} sx={{ display: { xs: "block", sm: "none" } }}>
          <Typography variant="subtitle1" gutterBottom>
            {Moment(date).format("ddd MMM Do, h:mma")}
          </Typography>
        </Grid>
        <Grid size={12} sx={{ display: { xs: "none", sm: "block" } }}>
          <Typography variant="subtitle1" gutterBottom>
            {Moment(date).format("dddd MMMM Do, h:mm a")}
          </Typography>
        </Grid>

        <Grid container spacing={0}>
          <Grid size={2} className={classes.justify}>
            {currentRound >= round ? (
              <Typography variant="h6">{hsideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
          <Grid size={8}>
            <Typography variant="subtitle2" gutterBottom>
              {venue}
            </Typography>
          </Grid>
          <Grid size={2} className={classes.justify}>
            {currentRound >= round ? (
              <Typography variant="h6">{asideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
        </Grid>
        <Grid size={12}>
          <Typography variant="subtitle1" gutterBottom>
            {winner}
          </Typography>
          <Typography variant="subtitle1" gutterBottom>
            {/* modelId guards fixtures Squiggle has no prediction for - a final
                whose teams are not decided yet would otherwise advertise
                "(100%) by 0 points" against two blank sides. */}
            {!winner && modelId ? (
              homeConfidence > 50 ? (
                <a
                  href={`https://squiggle.com.au/game/?gid=${modelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Typography variant="subtitle1" gutterBottom>
                    {habrev} ({Math.round(homeConfidence)}%) by{" "}
                    {Math.round(margin)} points
                  </Typography>
                </a>
              ) : (
                <a
                  href={`https://squiggle.com.au/game/?gid=${modelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Typography variant="subtitle1" gutterBottom>
                    {aabrev} ({100 - Math.round(homeConfidence)}%) by{" "}
                    {Math.round(margin)} points
                  </Typography>
                </a>
              )
            ) : (
              ""
            )}
          </Typography>
        </Grid>
      </Grid>
    </CardContent>
  );
};

export default FixtureCenterCard;

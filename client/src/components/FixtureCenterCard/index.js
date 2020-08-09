import React from "react";
import Grid from "@material-ui/core/Grid";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
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
  const updatedDate = Moment(date)
    .utcOffset(360)
    .format("ddd MMM Do, h:mm a");

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
        <Grid item xs={12}>
          <Typography variant="subtitle1" gutterBottom>
            {updatedDate}
          </Typography>
        </Grid>
        <Grid container spacing={0}>
          <Grid className={classes.justify} item xs={2}>
            {currentRound >= round ? (
              <Typography variant="h6">{hsideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
          <Grid item xs={8}>
            <Typography variant="subtitle2" gutterBottom>
              {venue}
            </Typography>
          </Grid>
          <Grid className={classes.justify} item xs={2}>
            {currentRound >= round ? (
              <Typography variant="h6">{asideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="subtitle1" gutterBottom>
            {winner}
          </Typography>
          <Typography variant="subtitle1" gutterBottom>
            {!winner ? (
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

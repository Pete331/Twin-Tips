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
}) => {
  const updatedDate = Moment(date)
    .utcOffset(360)
    .format("dddd MMMM Do, h:mm a");
  const classes = useStyles();
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
              <Typography variant="h5">{hsideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
          <Grid item xs={8}>
            <Typography variant="subtitle2" gutterBottom>
              {venue}
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
              {winner}
            </Typography>
          </Grid>
          <Grid className={classes.justify} item xs={2}>
            {currentRound >= round ? (
              <Typography variant="h5">{asideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
        </Grid>
      </Grid>
    </CardContent>
  );
};

export default FixtureCenterCard;

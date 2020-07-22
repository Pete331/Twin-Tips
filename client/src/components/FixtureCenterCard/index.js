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
}) => {
  const updatedDate = Moment(date)
    .utcOffset(360)
    .format("dddd MMMM Do YYYY, h:mm a");
  const classes = useStyles();
  return (
    <div>
      <CardContent>
        <Grid container spacing={0}>
          <Grid className={classes.justify} item xs={2}>
            <Typography variant="h5">{hsideattribute}</Typography>
          </Grid>
          <Grid item xs={8}>
            {" "}
            <p>{updatedDate}</p>
            <p>{venue}</p>
            <p>{winner}</p>
          </Grid>
          <Grid className={classes.justify} item xs={2}>
          <Typography variant="h5">{asideattribute}</Typography>
          </Grid>
        </Grid>
      </CardContent>
    </div>
  );
};

export default FixtureCenterCard;

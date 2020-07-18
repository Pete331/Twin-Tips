import React, { useEffect, useState, useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import Footer from "../../components/Footer";
import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/container";
import { makeStyles } from "@material-ui/core/styles";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import Grid from "@material-ui/core/Grid";
import Card from "@material-ui/core/Card";
import CardActions from "@material-ui/core/CardActions";
import CardContent from "@material-ui/core/CardContent";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";

const FixtureCard = ({
  venue,
  hteam,
  ateam,
  complete,
  hscore,
  ascore,
  winner,
  date,
  hteamlogo,
  ateamlogo,
}) => {
  return (
    <div>
      <Grid container spacing={0} align="center">
        <Grid item xs={3}>
          <Card variant="outlined">
            <CardContent>
              <Grid>
                <img src={`https://squiggle.com.au/${hteamlogo}`} />
              </Grid>
              {hteam}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6}>
          <Card variant="outlined">
            <CardContent>
              <Grid container spacing={0}>
                <Grid item xs={2}>
                  {hscore}
                </Grid>
                <Grid item xs={8}>
                  {" "}
                  {date}
                  {venue}
                  {complete}
                </Grid>
                <Grid item xs={2}>
                  {ascore}
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={3}>
          <Card variant="outlined">
            <CardContent>
              <Grid>
                <img src={`https://squiggle.com.au/${ateamlogo}`} />
              </Grid>
              {ateam}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
};

export default FixtureCard;

{
  /* <CardContent>
<Typography
  className={classes.title}
  color="textSecondary"
  gutterBottom
>
  Word of the Day
</Typography>
<Typography variant="h5" component="h2">
  be{bull}nev{bull}o{bull}lent
</Typography>
<Typography className={classes.pos} color="textSecondary">
  adjective
</Typography>
<Typography variant="body2" component="p">
  well meaning and kindly.
  <br />
  {'"a benevolent smile"'}
</Typography>
</CardContent>
<CardActions>
<Button size="small">Learn More</Button>
</CardActions> */
}

import React, { useEffect, useState, useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import Footer from "../../components/Footer";
import FixtureCard from "../../components/FixtureCard";
import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/container";
import Button from "@material-ui/core/button";
import { makeStyles } from "@material-ui/core/styles";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import FormGroup from "@material-ui/core/FormGroup";
import TextField from "@material-ui/core/TextField";

const TipsPage = () => {
  const { user } = useContext(AuthContext);
  //   want to add an initial state of current round
  const [round, setRound] = useState("7");
  const [roundFixture, setRoundFixture] = useState();
  const [topEightSelection, setTopEightSelection] = useState();
  const [bottomTenSelection, setBottomTenSelection] = useState();

  function submitTips() {
    console.log("Submitting your Tips!");
  }

  const useStyles = makeStyles((theme) => ({
    formControl: {
      margin: theme.spacing(1),
      minWidth: 120,
    },
    selectEmpty: {
      marginTop: theme.spacing(2),
    },
  }));

  const classes = useStyles();

  function handleChange(event) {
    setRound(event.target.value);
  }

  function handleSelectionChange(event) {
    if (event.target.value < 9) {
      console.log("Top 8: " + event.target.name);
      setTopEightSelection(event.target.name);
    } else {
      console.log("Bottom 10: " + event.target.name);
      setBottomTenSelection(event.target.name);
    }
  }

  //   on round state updating retrieve fixtures within that round
  useEffect(() => {
    API.getRoundDetails(round)
      .then((results) => {
        console.log(results.data);
        setRoundFixture(results.data);
      })
      .catch((err) => console.log(err));
  }, [round]);

  return (
    <div>
      <Navbar />
      <Container>
        <h3>{user.name}'s Tips</h3>
        <FormControl className={classes.formControl}>
          <InputLabel id="select-round">Round</InputLabel>
          <Select labelId="select-round" value={round} onChange={handleChange}>
            <MenuItem value={1}>Round 1</MenuItem>
            <MenuItem value={2}>Round 2</MenuItem>
            <MenuItem value={3}>Round 3</MenuItem>
            <MenuItem value={4}>Round 4</MenuItem>
            <MenuItem value={5}>Round 5</MenuItem>
            <MenuItem value={6}>Round 6</MenuItem>
            <MenuItem value={7}>Round 7</MenuItem>
            <MenuItem value={8}>Round 8</MenuItem>
            <MenuItem value={9}>Round 9</MenuItem>
            <MenuItem value={10}>Round 10</MenuItem>
            <MenuItem value={11}>Round 11</MenuItem>
            <MenuItem value={12}>Round 12</MenuItem>
          </Select>
        </FormControl>
        <FormGroup>
          {roundFixture ? (
            roundFixture.map((game) => {
              return (
                <FixtureCard
                  venue={game.venue}
                  hteam={game.hteam}
                  ateam={game.ateam}
                  complete={game.complete}
                  hscore={game.hscore}
                  ascore={game.ascore}
                  winner={game.winner}
                  date={game.date}
                  hteamlogo={game["home-team"][0]["logo"]}
                  ateamlogo={game["away-team"][0]["logo"]}
                  hteamrank={game["home-team-standing"][0]["rank"]}
                  ateamrank={game["away-team-standing"][0]["rank"]}
                  key={game.id}
                  handleSelectionChange={handleSelectionChange}
                  topEightSelection={topEightSelection}
                  bottomTenSelection={bottomTenSelection}
                />
              );
            })
          ) : (
            <FixtureCard data="No games" />
          )}
        </FormGroup>

        <p>
          Top 8 Selection:{" "}
          {!topEightSelection ? "Select a Top 8 Team" : topEightSelection}
          <TextField id="top8input" label="Top 8 Team Margin" variant="outlined" />
        </p>
        <p>
          Bottom 10 Selection:{" "}
          {!bottomTenSelection ? "Select a Bottom 10 Team" : bottomTenSelection}
          <TextField id="bottom10input" label="Bottom 10 Team Margin" variant="outlined" />
        </p>

        <Button variant="contained" color="primary" onClick={submitTips}>
          Submit Tips
        </Button>
      </Container>
      <Footer />
    </div>
  );
};

export default TipsPage;
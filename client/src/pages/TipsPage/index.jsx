import React, { useEffect, useState, useContext, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import { useHistory, Link } from "react-router-dom";
import FixtureCard from "../../components/FixtureCard";
import LockoutAlert from "../../components/LockoutAlert";
import Loader from "../../components/Loader";
import API from "../../utils/TipsAPI";
import Container from "@material-ui/core/Container";
import Button from "@material-ui/core/Button";
import { makeStyles } from "@material-ui/core/styles";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import FormGroup from "@material-ui/core/FormGroup";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import Alert from "../../components/Alerts";
import Box from "@material-ui/core/Box";
import Moment from "moment";

const TipsPage = () => {
  const { user } = useContext(AuthContext);
  const { seasonState } = useContext(SeasonContext);
  const history = useHistory();
  const alertRef = useRef();

  const [isLoading, setIsLoading] = useState(true);
  const [currentRound, setCurrentRound] = useState();
  const [round, setRound] = useState();
  const [roundFixture, setRoundFixture] = useState();
  const [topEightSelection, setTopEightSelection] = useState();
  const [bottomTenSelection, setBottomTenSelection] = useState();
  const [marginTopEight, setMarginTopEight] = useState();
  const [marginBottomTen, setMarginBottomTen] = useState();
  const [lockout, setLockout] = useState();
  const [lastRoundSelectionT8, setLastRoundSelectionT8] = useState();
  const [lastRoundSelectionB10, setLastRoundSelectionB10] = useState();
  const [modelResults, setModelResults] = useState();

  function submitTips() {
    if (
      topEightSelection === undefined ||
      topEightSelection === null ||
      bottomTenSelection === undefined ||
      bottomTenSelection === null
    ) {
      alertRef.current.createAlert("error", "You need to select 2 teams", true);
      return;
    }
    if (
      (marginTopEight === undefined ||
        marginTopEight === null ||
        marginTopEight === "" ||
        marginTopEight === "0" ||
        marginTopEight === 0) &&
      (marginBottomTen === undefined ||
        marginBottomTen === null ||
        marginBottomTen === "" ||
        marginBottomTen === "0" ||
        marginBottomTen === 0)
    ) {
      alertRef.current.createAlert(
        "error",
        "You need to enter a margin for one of the games",
        true
      );

      return;
    }

    const data = {
      topEightSelection: topEightSelection,
      bottomTenSelection: bottomTenSelection,
      marginTopEight: marginTopEight,
      marginBottomTen: marginBottomTen,
      round: round,
      user: user.id,
      season: roundFixture[0].year,
    };

    console.log("Submitting your Tips!");
    console.log(data);

    API.postTips(data)
      .then((res) => {
        history.push({
          pathname: "/dashboard",
          alert: {
            type: "success",
            message: "Tips Submitted",
            show: true,
          },
        });
      })
      .catch((err) => console.log(err));
  }

  function handleChange(event) {
    setRound(event.target.value);
  }
  function handleChangeTopEight(event) {
    setMarginBottomTen("");
    setMarginTopEight(event.target.value);
  }
  function handleChangeBottomTen(event) {
    setMarginTopEight("");
    setMarginBottomTen(event.target.value);
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

  // checks if teams selected are playing each other
  useEffect(() => {
    if (roundFixture) {
      roundFixture.forEach((game) => {
        if (
          (topEightSelection === game.hteam &&
            bottomTenSelection === game.ateam) ||
          (bottomTenSelection === game.hteam &&
            topEightSelection === game.ateam)
        ) {
          setTopEightSelection(null);
          setBottomTenSelection(null);
        }
      });
      loadingTimeout();
    }
  }, [topEightSelection, bottomTenSelection, roundFixture]);

  //   on round state updating retrieve fixtures within that round and squiggle model api results
  // ned to add something in here so that it updates from squiggle checking results
  useEffect(() => {
    if (round) {
      API.getRoundDetails(round)
        .then((results) => {
          API.getModels(round).then((modelResults) => {
            // console.log(modelResults.data.tips);
            console.log(results.data);
            setModelResults(modelResults.data.tips);
            setRoundFixture(results.data);
          });
        })
        .catch((err) => console.log(err));
    }
  }, [round]);

  // Round and lockout come from the server's season state.
  useEffect(() => {
    if (!seasonState) return;
    setCurrentRound(seasonState.currentRound);
    setRound(seasonState.currentRound);
    setLockout(seasonState.lockout);
  }, [seasonState]);

  useEffect(() => {
    if (currentRound) {
      previousRoundTipsFunction({ user: user.id, round: currentRound - 1 });
      currentRoundTipsFunction({ user: user.id, round: currentRound });
    }
  }, [currentRound, user.id]);

  // gets previous rounds tips so that disables checkbox
  function previousRoundTipsFunction(data) {
    API.getPreviousRoundTips(data).then((results) => {
      if (results.data) {
        // console.log(results.data);
        setLastRoundSelectionT8(results.data.topEightSelection);
        setLastRoundSelectionB10(results.data.bottomTenSelection);
      }
    });
  }

  // gets current rounds tips so that shows in checkbox
  async function currentRoundTipsFunction(round) {
    await API.getCurrentRoundTips(round).then((results) => {
      // console.log(results.data);
      if (results.data) {
        setTopEightSelection(results.data.topEightSelection);
        setBottomTenSelection(results.data.bottomTenSelection);
        setMarginTopEight(results.data.marginTopEight);
        setMarginBottomTen(results.data.marginBottomTen);
      }
    });
  }

  // The round and lockout came from comparing fixture dates here, with a three
  // hour allowance for match duration. GET /api/season reports both directly
  // now, and unlike this code it understands finals - see services/season.js.

  useEffect(() => {
    // updates round fixture/result
    if (currentRound && lockout) {
      // if (currentRound) {
      getRoundFixture();
    }
  }, [currentRound, lockout]);

  // gets squiggle fixture and writes to db
  function getRoundFixture() {
    console.log("Downloading round fixture from squiggle API");
    API.getRoundFixture(currentRound)
      .then((results) => {
        const data = results.data;
        // console.log(data);
        API.postRoundFixture(data);
      })
      .catch((err) => console.log(err));
  }

  const loadingTimeout = () => {
    setTimeout(() => {
      setIsLoading(false);
      clearTimeout(this);
    }, 100);
  };

  // Selectable rounds, from the season's first (0 where there is an Opening
  // Round) to the current one.
  const roundOptions = [];
  if (seasonState && seasonState.currentRound !== null) {
    const from = seasonState.firstRound !== null ? seasonState.firstRound : 1;
    for (let r = from; r <= seasonState.currentRound; r += 1) {
      roundOptions.push(r);
    }
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

  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : seasonState && !seasonState.tippingOpen ? (
        // Without this the page rendered empty whenever tipping was closed:
        // the fixtures it wanted did not exist, or the round was a final with
        // no bottom 10 to pick from. Say so instead of showing nothing.
        <Container className="container" maxWidth="md">
          <h4>{user.name}'s Tips</h4>
          <Box boxShadow={3} mb={2} p={2} className="Box">
            <h5>
              {seasonState.roundName
                ? `${seasonState.season} - ${seasonState.roundName}`
                : `${seasonState.season} season`}
            </h5>
            <p>{seasonState.message}</p>
            <p>
              You can still review past rounds on the{" "}
              <Link to="/dashboard">dashboard</Link> and see where everyone
              finished on the <Link to="/leaderboard">leaderboard</Link>.
            </p>
          </Box>
        </Container>
      ) : (
        <Container className="container" maxWidth="md">
          <h4>{user.name}'s Tips</h4>
          <LockoutAlert lockout={lockout} />
          <p>
            For Georgey: Select one Top 8 team (green) & one Bottom 10 team
            (red). Pick a margin for one of your selections.
          </p>
          <Box boxShadow={3} mb={2} p={2} className="Box">
            <Grid container direction="row">
              <Grid item xs={6}>
                <FormControl className={classes.formControl}>
                  <InputLabel id="select-round">Round</InputLabel>
                  <Select
                    labelId="select-round"
                    // Round 0 is falsy, so check for null explicitly.
                    value={round === undefined || round === null ? "" : round}
                    onChange={handleChange}
                  >
                    {/* Generated from the season state rather than a fixed
                        list of 23, which could not represent an Opening
                        Round or a season with more rounds. */}
                    {roundOptions.map((r) => (
                      <MenuItem key={r} value={r}>
                        {r === 0 ? "Opening Round" : `Round ${r}`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <a
                  href="https://squiggle.com.au/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginLeft: "0px" }}
                  align="right"
                >
                  {" "}
                  <Typography variant="subtitle1">Predictions By:</Typography>
                  <img
                    src="./assets/squiggle-logo.png"
                    alt="Squiggle logo"
                    width="100"
                    height="auto"
                    align="right"
                  ></img>
                </a>
              </Grid>
            </Grid>
            <FormGroup>
              {roundFixture ? (
                roundFixture.map((game) => {
                  return (
                    <FixtureCard
                      id={game.id}
                      modelResults={modelResults}
                      venue={game.venue}
                      hteam={game.hteam}
                      ateam={game.ateam}
                      complete={game.complete}
                      hscore={game.hscore}
                      ascore={game.ascore}
                      winner={
                        game.winner === game.hteam
                          ? game["home-team"][0]["abbrev"]
                          : game["away-team"][0]["abbrev"]
                      }
                      date={game.date}
                      round={game.round}
                      hteamlogo={game["home-team"][0]["logo"]}
                      ateamlogo={game["away-team"][0]["logo"]}
                      hteamrank={game["home-team-standing"][0]["rank"]}
                      ateamrank={game["away-team-standing"][0]["rank"]}
                      aabrev={game["away-team"][0]["abbrev"]}
                      habrev={game["home-team"][0]["abbrev"]}
                      key={game.id}
                      handleSelectionChange={handleSelectionChange}
                      topEightSelection={topEightSelection}
                      bottomTenSelection={bottomTenSelection}
                      currentRound={currentRound}
                      lockout={lockout}
                      lastRoundSelectionT8={lastRoundSelectionT8}
                      lastRoundSelectionB10={lastRoundSelectionB10}
                    />
                  );
                })
              ) : (
                <FixtureCard data="No games" />
              )}
            </FormGroup>
          </Box>
          <Alert ref={alertRef} />
          {round === currentRound && !lockout ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <Grid container direction="row">
                <Grid item xs={6} align="right" style={{ padding: "10px" }}>
                  <Typography variant="subtitle1" gutterBottom>
                    {!topEightSelection
                      ? "Select a Top 8 Team"
                      : "Top 8 Selection: " + topEightSelection}{" "}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    id="top8input"
                    label="Margin"
                    variant="outlined"
                    type="number"
                    value={marginTopEight || ""}
                    onChange={handleChangeTopEight}
                    inputProps={{
                      min: 0,
                      max: 200,
                      style: { textAlign: "center" },
                    }}
                    style={{ width: 80 }}
                  />
                </Grid>
                <Grid item xs={6} align="right" style={{ padding: "10px" }}>
                  <Typography variant="subtitle1" gutterBottom>
                    {!bottomTenSelection
                      ? "Select a Bottom 10 Team"
                      : "Bottom 10 Selection: " + bottomTenSelection}{" "}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    id="bottom10input"
                    label="Margin"
                    variant="outlined"
                    type="number"
                    value={marginBottomTen || ""}
                    onChange={handleChangeBottomTen}
                    inputProps={{
                      min: 0,
                      max: 200,
                      style: { textAlign: "center" },
                    }}
                    style={{ width: 80 }}
                  />
                </Grid>
              </Grid>

              <Button variant="contained" color="primary" onClick={submitTips}>
                Submit Tips
              </Button>
            </div>
          ) : (
            ""
          )}
        </Container>
      )}
    </div>
  );
};

export default TipsPage;

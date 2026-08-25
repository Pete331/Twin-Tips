import React, { useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import { Link } from "react-router-dom";
import API from "../../utils/TipsAPI";
import Loader from "../../components/Loader";
import DashboardCurrentRoundSelections from "../../components/DashboardCurrentRoundSelections";
import Container from "@material-ui/core/Container";
import LockoutAlert from "../../components/LockoutAlert";

import Button from "@material-ui/core/Button";
import Table from "@material-ui/core/Table";
import Box from "@material-ui/core/Box";
import Grid from "@material-ui/core/Grid";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import { makeStyles } from "@material-ui/core/styles";
import InputLabel from "@material-ui/core/InputLabel";
import Alert from "../../components/Alerts";
import Moment from "moment";
import calcResults from "../../utils/roundResultCalc";

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const { seasonState, availableSeasons } = useContext(SeasonContext);
  const alertRef = useRef();

  const [isLoading, setIsLoading] = useState(true);
  const [lockout, setLockout] = useState(true);
  const [roundResults, setRoundResults] = useState();
  const [currentRoundSelections, setCurrentRoundSelections] = useState();
  // round is round dropdown
  const [round, setRound] = useState();
  const [currentRound, setCurrentRound] = useState();
  // Follows the server rather than a year hardcoded when this page was written.
  const [season, setSeason] = useState(null);

  // The season, round and lockout all come from GET /api/season now, so the
  // page no longer works them out from fixture dates itself.
  useEffect(() => {
    if (!seasonState) return;

    setSeason((current) => (current === null ? seasonState.season : current));
    setCurrentRound(seasonState.currentRound);
    setLockout(seasonState.lockout);
    setRound((current) =>
      current === undefined || current === null
        ? seasonState.currentRound
        : current
    );
  }, [seasonState]);

  // The round and lockout used to be reverse-engineered here from the dates of
  // the next and previous fixtures, with a three hour fudge for match duration.
  // GET /api/season answers both directly now, and knows about finals, so that
  // logic lives on the server - see services/season.js.

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

  // added initial mount so that isnt called on mount
  useEffect(() => {
    // results in table
    if (round) {
      roundResult({ round: round });
    }
  }, [round]);

  useEffect(() => {
    // Refreshes scores for a round in progress. Round 0 is a real round, so
    // this checks for null rather than truthiness.
    if (currentRound !== undefined && currentRound !== null && lockout) {
      getRoundFixture();
    }

    // shows current round tips on top of dashboard if done
    currentRoundTips({ user: user.id, round: currentRound });
    // Calculate results only for the live season - not for a past one picked
    // from the dropdown, and not during finals, where the top-8/bottom-10
    // mechanic does not apply. This used to read `season === 2022`, so it had
    // been silently doing nothing since 2022.
    if (
      seasonState &&
      season === seasonState.season &&
      !seasonState.isFinals &&
      !seasonState.seasonComplete
    ) {
      if (currentRound && lockout) {
        (async function () {
          await calcResults({ round: currentRound });
          console.log(
            "Calculating Tipping Results (but the round hasn't ended)"
          );
          loadingTimeout();
        })();
        // if no lockout calculates results for the previous round
      } else if (currentRound && !lockout) {
        (async function () {
          await calcResults({ round: currentRound - 1 });
          console.log(
            "Calculating Tipping Results for Round:" + (currentRound - 1)
          );
          loadingTimeout();
        })();
      }
    } else {
      console.log("Not calculating: past season, finals, or season complete");
      loadingTimeout();
    }
  }, [currentRound, lockout, seasonState, season]);

  async function roundResult(data) {
    await API.getRoundResult(data)
      .then((results) => {
        // console.log(results.data);
        setRoundResults(results.data);
      })
      .catch((err) => console.log(err));
  }

  async function currentRoundTips(data) {
    await API.getCurrentRoundTips(data)
      .then((results) => {
        // console.log(results.data);
        setCurrentRoundSelections(results.data);
      })
      .catch((err) => console.log(err));
  }

  // The ladder used to be refreshed from here: whenever someone loaded the
  // dashboard outside a lockout, and only if the stored ladder was more than
  // three days old. That meant the ladder only ever updated if a human happened
  // to visit, and because rounds run about a week, the three-day check fired
  // mid-round as often as not - moving teams between the top 8 and the bottom
  // 10 after people had already tipped. Snapshots are now taken server-side
  // when a round completes; see services/seasonSync.js.

  function roundHandleChange(event) {
    setRound(event.target.value);
  }

  function seasonHandleChange(event) {
    setSeason(event.target.value);
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

  const loadingTimeout = () => {
    setTimeout(() => {
      setIsLoading(false);
      clearTimeout(this);
    }, 300);
  };

  // Rounds the user can look back at: from the season's first round (0 where
  // there is an Opening Round) up to the current one.
  const roundOptions = [];
  if (seasonState && seasonState.currentRound !== null) {
    const from = seasonState.firstRound !== null ? seasonState.firstRound : 1;
    for (let r = from; r <= seasonState.currentRound; r += 1) {
      roundOptions.push(r);
    }
  }

  const classes = useStyles();
  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : (
        <Container className="container" maxWidth="md">
          <div>
            <h4>Welcome {user.name}</h4>
          </div>
          <LockoutAlert lockout={lockout} />
          {currentRoundSelections ? (
            <Grid item xs={12} sm={8}>
              <Box boxShadow={3} p={0.5} mb={2} className="Box">
                <Alert ref={alertRef} />
                <DashboardCurrentRoundSelections
                  currentRoundSelections={currentRoundSelections}
                  currentRound={currentRound}
                />
              </Box>
            </Grid>
          ) : (
            ""
          )}
          <Box boxShadow={3} p={2} mb={2} className="Box">
            <FormControl className={classes.formControl}>
              <InputLabel id="select-round">Round</InputLabel>
              <Select
                labelId="select-round"
                // Round 0 is falsy, so check for null rather than truthiness.
                value={round === undefined || round === null ? "" : round}
                onChange={roundHandleChange}
              >
                {/* Generated from the season state: the list used to be 23
                    hand-written entries starting at Round 1, so it could not
                    show Round 0 (the Opening Round) and stopped at 23 even
                    when the season ran longer. */}
                {roundOptions.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r === 0 ? "Opening Round" : `Round ${r}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {/* style={{ width: "auto" }} */}

            {roundResults && roundResults.length ? (
              <Table aria-label="simple table">
                <TableHead>
                  <TableRow>
                    <TableCell>Player</TableCell>
                    <TableCell
                      align="right"
                      style={{
                        borderLeft: "1px solid lightGrey",
                        paddingLeft: "5px",
                        paddingRight: "5px",
                      }}
                    >
                      Top 8 Selection
                    </TableCell>
                    <TableCell
                      align="right"
                      style={{
                        borderLeft: "1px solid lightGrey",
                        paddingLeft: "5px",
                        paddingRight: "5px",
                      }}
                    >
                      Bottom 10 Selection
                    </TableCell>
                    <TableCell
                      align="right"
                      style={{
                        borderLeft: "1px solid lightGrey",
                        paddingLeft: "5px",
                        paddingRight: "5px",
                      }}
                    >
                      Correct Selections & Margin
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {roundResults
                    ? roundResults.map((user) => {
                        // console.log(user);
                        return (
                          <TableRow
                            key={user._id}
                            style={{
                              backgroundColor: user.winnings
                                ? "rgb(233,182,49,.8)"
                                : "",
                            }}
                          >
                            <TableCell
                              style={{
                                paddingLeft: "5px",
                                paddingRight: "5px",
                              }}
                            >
                              {user.userDetail[0].firstName}{" "}
                              {user.userDetail[0].lastName}
                            </TableCell>

                            {user.round === currentRound && !lockout ? (
                              <TableCell></TableCell>
                            ) : (
                              <TableCell
                                align="right"
                                style={{
                                  borderLeft: "1px solid lightGrey",
                                  paddingLeft: "5px",
                                  paddingRight: "5px",
                                  backgroundColor:
                                    user.topEightCorrect === true
                                      ? "rgba(80,200,120,.6)"
                                      : user.topEightCorrect === false
                                      ? "rgb(255,77,76,.6)"
                                      : "",
                                }}
                              >
                                {user.topEightSelection}{" "}
                                {user.marginTopEight
                                  ? "(" + user.marginTopEight + ")"
                                  : ""}
                              </TableCell>
                            )}
                            {user.round === currentRound && !lockout ? (
                              <TableCell></TableCell>
                            ) : (
                              <TableCell
                                align="right"
                                style={{
                                  borderLeft: "1px solid lightGrey",
                                  backgroundColor:
                                    user.bottomTenCorrect === true
                                      ? "rgba(80,200,120,.6)"
                                      : user.bottomTenCorrect === false
                                      ? "rgb(255,77,76,.6)"
                                      : "",
                                  paddingLeft: "5px",
                                  paddingRight: "5px",
                                }}
                              >
                                {user.bottomTenSelection}{" "}
                                {user.marginBottomTen
                                  ? "(" + user.marginBottomTen + ")"
                                  : ""}
                              </TableCell>
                            )}
                            {user.round === currentRound && !lockout ? (
                              <TableCell></TableCell>
                            ) : (
                              <TableCell
                                align="right"
                                style={{
                                  borderLeft: "1px solid lightGrey",
                                  paddingLeft: "5px",
                                  paddingRight: "5px",
                                }}
                              >
                                {user.correctTips !== undefined
                                  ? user.topEightDifference ||
                                    user.bottomTenDifference ||
                                    user.topEightDifference === 0 ||
                                    user.bottomTenDifference === 0
                                    ? user.bottomTenCorrect === null ||
                                      user.topEightCorrect === null
                                      ? `*${user.correctTips}(${
                                          user.topEightDifference ||
                                          user.bottomTenDifference
                                        })`
                                      : `${user.correctTips} 
                              (${
                                user.topEightDifference ||
                                user.bottomTenDifference
                              })`
                                    : `*${user.correctTips}`
                                  : ""}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    : null}
                </TableBody>
              </Table>
            ) : (
              <h5>No Selections to display</h5>
            )}
          </Box>
          <Link to={{ pathname: "/TipsPage" }}>
            <Button variant="contained" color="primary">
              {!lockout ? (
                currentRoundSelections ? (
                  <span>Edit Round {currentRound} Tips</span>
                ) : (
                  <span>Enter Round {currentRound} Tips</span>
                )
              ) : (
                <span>View Round {currentRound} Tips</span>
              )}
            </Button>
          </Link>
        </Container>
      )}
    </div>
  );
};

export default Dashboard;

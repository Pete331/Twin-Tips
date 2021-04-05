import React, { useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
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
  const alertRef = useRef();

  const [isLoading, setIsLoading] = useState(true);
  const [lockout, setLockout] = useState(true);
  const [roundResults, setRoundResults] = useState();
  const [currentRoundSelections, setCurrentRoundSelections] = useState();
  // round is round dropdown
  const [round, setRound] = useState();
  const [currentRound, setCurrentRound] = useState();

  // run these functions on page load
  useEffect(() => {
    currentRoundFunction();
  }, []);

  // what current round re we in and are we in a lockout?
  function currentRoundFunction() {
    API.getCurrentRound()
      .then((results) => {
        // console.log(results.data.upperRound.round);
        // console.log(results.data.lowerRound.round);
        if (results.data.upperRound.round === results.data.lowerRound.round) {
          setLockout(true);
          setRound(results.data.upperRound.round);
          setCurrentRound(results.data.upperRound.round);
        } else {
          // timeAfterLastGameOfRound adds 3 hours so that the last game of the round duration is taken into account before lockout is lifted
          const timeAfterLastGameOfRound = Moment(results.data.lowerRound.date)
            .utcOffset(300)
            .add(3, "hours")
            .format("MMMM Do, h:mm a");
          const now = Moment().format("MMMM Do, h:mm a");
          console.log(
            "now: " +
              now +
              " - last game +3 hrs: " +
              timeAfterLastGameOfRound +
              " - after last game: " +
              (now > timeAfterLastGameOfRound)
          );
          if (now > timeAfterLastGameOfRound) {
            console.log("after last game of round");
            setLockout(false);
            setCurrentRound(results.data.upperRound.round);
            setRound(results.data.upperRound.round - 1);
          } else {
            console.log("Its currently in the last game of the round");
            setLockout(true);
            setRound(results.data.upperRound.round - 1);
            setCurrentRound(results.data.upperRound.round - 1);
          }
        }
      })
      .catch((err) => console.log(err));
  }

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
    // updates round fixture/result
    if (currentRound && lockout) {
      // if (currentRound) {
      getRoundFixture();
    }

    // if lockout is false then download ladder
    // console.log(lockout);
    if (currentRound && !lockout) {
      getStandingsFunction();
    }
    // shows current round tips on top of dashboard if done
    currentRoundTips({ user: user.id, round: currentRound });
    // calcalates results for the current round
    if (currentRound) {
      (async function () {
        await calcResults({ round: currentRound });
        console.log("Calculating Tipping Results");
        loadingTimeout();
      })();
    }
  }, [currentRound, lockout]);

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

  // this function runs if it is a lockout - checks to see when the standings in the db was updated and only updates if 3 days old or more
  async function getStandingsFunction() {
    await API.getStandingsDb().then((results) => {
      // console.log(results.data[0].updatedAt);
      const lastStandingsUpdatedTime = Moment(results.data[0].updatedAt).add(
        3,
        "days"
      );
      const now = Moment();
      // console.log(now + lastStandingsUpdatedTime);
      // console.log(now > lastStandingsUpdatedTime);
      // dont update if current round = 1 as manually input end of last seasons ladder
      if (now > lastStandingsUpdatedTime && currentRound !== 1) {
        API.getStandings()
          .then((results) => {
            console.log("Downloading updated standings from squiggle");
            console.log(results.data);
            API.postStandings(results.data);
          })
          .catch((err) => console.log(err));
        // re download fixtures for whole season, this will cover the last game of the round and any fixture updates ahead
        API.getFixture()
          .then((results) => {
            console.log("dowloading yearly fixture");
            console.log(results.data);
            API.postFixture(results.data);
          })
          .catch((err) => console.log(err));
      }
    });
  }

  function roundHandleChange(event) {
    setRound(event.target.value);
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
                value={round ? round : ""}
                onChange={roundHandleChange}
              >
                <MenuItem value={1}>Round 1</MenuItem>
                {currentRound < 2 ? "" : <MenuItem value={2}>Round 2</MenuItem>}
                {currentRound < 3 ? "" : <MenuItem value={3}>Round 3</MenuItem>}
                {currentRound < 4 ? "" : <MenuItem value={4}>Round 4</MenuItem>}
                {currentRound < 5 ? "" : <MenuItem value={5}>Round 5</MenuItem>}
                {currentRound < 6 ? "" : <MenuItem value={6}>Round 6</MenuItem>}
                {currentRound < 7 ? "" : <MenuItem value={7}>Round 7</MenuItem>}
                {currentRound < 8 ? "" : <MenuItem value={8}>Round 8</MenuItem>}
                {currentRound < 9 ? "" : <MenuItem value={9}>Round 9</MenuItem>}
                {currentRound < 10 ? (
                  ""
                ) : (
                  <MenuItem value={10}>Round 10</MenuItem>
                )}
                {currentRound < 11 ? (
                  ""
                ) : (
                  <MenuItem value={11}>Round 11</MenuItem>
                )}
                {currentRound < 12 ? (
                  ""
                ) : (
                  <MenuItem value={12}>Round 12</MenuItem>
                )}
                {currentRound < 13 ? (
                  ""
                ) : (
                  <MenuItem value={13}>Round 13</MenuItem>
                )}
                {currentRound < 14 ? (
                  ""
                ) : (
                  <MenuItem value={14}>Round 14</MenuItem>
                )}
                {currentRound < 15 ? (
                  ""
                ) : (
                  <MenuItem value={15}>Round 15</MenuItem>
                )}
                {currentRound < 16 ? (
                  ""
                ) : (
                  <MenuItem value={16}>Round 16</MenuItem>
                )}
                {currentRound < 17 ? (
                  ""
                ) : (
                  <MenuItem value={17}>Round 17</MenuItem>
                )}
                {currentRound < 18 ? (
                  ""
                ) : (
                  <MenuItem value={18}>Round 18</MenuItem>
                )}
                {currentRound < 19 ? (
                  ""
                ) : (
                  <MenuItem value={19}>Round 19</MenuItem>
                )}
                {currentRound < 20 ? (
                  ""
                ) : (
                  <MenuItem value={20}>Round 20</MenuItem>
                )}
                {currentRound < 21 ? (
                  ""
                ) : (
                  <MenuItem value={21}>Round 21</MenuItem>
                )}
                {currentRound < 22 ? (
                  ""
                ) : (
                  <MenuItem value={22}>Round 22</MenuItem>
                )}
                {currentRound < 23 ? (
                  ""
                ) : (
                  <MenuItem value={23}>Round 23</MenuItem>
                )}
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
                        console.log(user);
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

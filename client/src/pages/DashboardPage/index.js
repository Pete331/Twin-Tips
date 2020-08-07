import React, { useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { Link } from "react-router-dom";
import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import DashboardCurrentRoundSelections from "../../components/DashboardCurrentRoundSelections";
import Container from "@material-ui/core/Container";
import Footer from "../../components/Footer";
import AdminComponent from "../../components/AdminComponent";
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

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const alertRef = useRef();
  const isInitialMount = useRef(true);

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
            .utcOffset(360)
            .add(3, "hours")
            .format("MMMM Do, h:mm a");
          const now = Moment().format("MMMM Do, h:mm a");
          // console.log(now > timeAfterLastGameOfRound);
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

  function getRoundFixture() {
    API.getRoundFixture(currentRound)
      .then((results) => {
        const data = { fixture: results.data, round: currentRound };
        console.log(data);
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
    // updates round fixture
    if (currentRound) {
      getRoundFixture();
    }
    // shows current round tips on top of dashboard if done
    currentRoundTips({ user: user.id, round: currentRound });
    // if lockout is false then download ladder
    // console.log(lockout);
    if (currentRound && !lockout) {
      getStandingsFunction();
    }
  }, [currentRound]);

  async function roundResult(data) {
    await API.getRoundResult(data)
      .then((results) => {
        console.log(results.data);
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

  // this function runs if it is a lockout - checks to see when the standings i the db was updated and only updates if 3 days old or more
  async function getStandingsFunction() {
    await API.getStandingsDb().then((results) => {
      // console.log(results.data[0].updatedAt);
      const lastStandingsUpdatedTime = Moment(results.data[0].updatedAt)
        .add(3, "days")
       
      const now = Moment()
      // console.log(now + lastStandingsUpdatedTime);
      // console.log(now > lastStandingsUpdatedTime);
      if (now > lastStandingsUpdatedTime) {
        API.getStandings()
          .then((results) => {
            console.log("Downloading updated standings from squiggle");
            console.log(results.data);
            API.postStandings(results.data);
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

  const classes = useStyles();
  return (
    <div>
      <Navbar />
      <Container className="container" maxWidth="md">
        <div>
          <h4>Welcome {user.name}</h4>
        </div>
        {lockout ? (
          <h4>
            Lockout:{" "}
            <span
              style={{
                color: "red",
              }}
            >
              Yes
            </span>
          </h4>
        ) : (
          <h4>
            Lockout:{" "}
            <span
              style={{
                color: "green",
              }}
            >
              No
            </span>
          </h4>
        )}
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
          {/* style={{ width: "auto" }} */}
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
              {roundResults && (round !== currentRound || lockout)
                ? roundResults.map((user) => {
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
                      </TableRow>
                    );
                  })
                : null}
            </TableBody>
          </Table>
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
        {user.admin ? <AdminComponent /> : ""}
        <Box mt={8}></Box>
      </Container>
      <Footer />
    </div>
  );
};

export default Dashboard;

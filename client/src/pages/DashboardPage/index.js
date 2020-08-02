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

  const [currentRound, setCurrentRound] = useState();
  const [lockout, setLockout] = useState();
  const [roundResults, setRoundResults] = useState();
  const [currentRoundSelections, setCurrentRoundSelections] = useState();
  const [round, setRound] = useState();

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
            .format("dddd MMMM Do, h:mm a");
          const now = Moment().format("dddd MMMM Do, h:mm a");
          console.log(now < timeAfterLastGameOfRound);
          if (now < timeAfterLastGameOfRound) {
            console.log("after game");
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

  // added initial mount so that isnt called on mount
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      // results in table
      roundResult({ round: round });
      // current round tips if done
      currentRoundTips({ user: user.id, round: currentRound });
      // if lockout is false then download ladder
      if (!lockout) {
        console.log("Lockout is lifted so we are getting the updated ladder");
        getStandingsFunction();
      }
    }
  }, [currentRound, round]);

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

  async function getStandingsFunction() {
    await API.getStandings()
      .then((results) => {
        console.log(results.data);
        API.postStandings(results.data);
      })
      .catch((err) => console.log(err));
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
      <Container className="container">
        <div>
          <h4>Welcome {user.name}</h4>
        </div>
        {lockout ? <h4>Lockout: Yes</h4> : <h4>Lockout: No</h4>}
        {currentRoundSelections ? (
          <Grid item xs={12} sm={6}>
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
          <Table aria-label="simple table">
            <TableHead>
              <TableRow>
                <TableCell>Player</TableCell>
                <TableCell align="right">Top 8 Selection</TableCell>
                <TableCell align="right">Bottom 10 Selection</TableCell>
                <TableCell align="right">Correct Selections & Margin</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roundResults
                ? roundResults.map((user) => {
                    return (
                      <TableRow
                        key={user._id}
                        style={{
                          backgroundColor: user.winnings ? "#EAB632" : "",
                        }}
                      >
                        <TableCell>
                          {user.userDetail[0].firstName}{" "}
                          {user.userDetail[0].lastName}
                        </TableCell>
                        <TableCell
                          align="right"
                          style={{
                            backgroundColor:
                              user.topEightCorrect === true
                                ? "#50c878"
                                : user.topEightCorrect === false
                                ? "#FF4D4D"
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
                            backgroundColor:
                              user.bottomTenCorrect === true
                                ? "#50c878"
                                : user.bottomTenCorrect === false
                                ? "#FF4D4D"
                                : "",
                          }}
                        >
                          {user.bottomTenSelection}{" "}
                          {user.marginBottomTen
                            ? "(" + user.marginBottomTen + ")"
                            : ""}
                        </TableCell>
                        <TableCell align="right">
                          {user.correctTips !== undefined
                            ? user.topEightDifference ||
                              user.bottomTenDifference
                              ? user.bottomTenCorrect === null ||
                                user.topEightCorrect === null
                                ? `*${
                                    user.correctTips
                                  }(${user.topEightDifference ||
                                    user.bottomTenDifference})`
                                : `${user.correctTips} 
                              (${user.topEightDifference ||
                                user.bottomTenDifference})`
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

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
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import { makeStyles } from "@material-ui/core/styles";
import InputLabel from "@material-ui/core/InputLabel";

const Dashboard = () => {
  const { user } = useContext(AuthContext);

  const isInitialMount = useRef(true);

  const [currentRound, setCurrentRound] = useState();
  const [lockout, setLockout] = useState();
  const [roundResults, setRoundResults] = useState();
  const [currentRoundSelections, setCurrentRoundSelections] = useState();
  const [round, setRound] = useState(8);

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
        }
        setCurrentRound(results.data.upperRound.round);
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
      <Container>
        <div>
          <h4>Welcome {user.name}</h4>
        </div>
        {lockout ? <h4>Lockout: True</h4> : <h4>Lockout: False</h4>}
        <DashboardCurrentRoundSelections
          currentRoundSelections={currentRoundSelections}
          currentRound={currentRound}
        />

        <FormControl className={classes.formControl}>
          <InputLabel id="select-round">Round</InputLabel>
          <Select
            labelId="select-round"
            value={round}
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
              <TableCell>User</TableCell>
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
                        {user.correctTips} (
                        {user.topEightDifference || user.bottomTenDifference})
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>

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
      </Container>
      <Footer />
    </div>
  );
};

export default Dashboard;

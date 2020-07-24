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

const Dashboard = () => {
  const { user } = useContext(AuthContext);

  const isInitialMount = useRef(true);

  const [currentRound, setCurrentRound] = useState();
  const [lastRoundResults, setLastRoundResults] = useState();
  const [currentRoundSelections, setCurrentRoundSelections] = useState();

  // run these functions on page load
  useEffect(() => {
    currentRoundFunction();
  }, []);

  function currentRoundFunction() {
    API.getCurrentRound()
      .then((results) => {
        // console.log(results.data.round);
        setCurrentRound(results.data.round);
      })
      .catch((err) => console.log(err));
  }

  // added initial mount so that isnt called on mount
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      LastRoundResult({ previousRound: currentRound - 1 });
      currentRoundTips({ user: user.id, round: currentRound });
      previousResults();
    }
  }, [currentRound]);

  function LastRoundResult(data) {
    API.getLastRoundResult(data)
      .then((results) => {
        // console.log(results.data);
        setLastRoundResults(results.data);
      })
      .catch((err) => console.log(err));
  }

  function currentRoundTips(data) {
    API.getCurrentRoundTips(data)
      .then((results) => {
        // console.log(results.data);
        setCurrentRoundSelections(results.data);
      })
      .catch((err) => console.log(err));
  }

  function previousResults() {
    API.getResults()
      .then((results) => {
        console.log(results.data);
        // setCurrentRoundSelections(results.data);
      })
      .catch((err) => console.log(err));
  }

  return (
    <div>
      <Navbar />
      <Container>
        <div>
          <h4>Welcome {user.name}</h4>
        </div>
        <DashboardCurrentRoundSelections
          currentRoundSelections={currentRoundSelections}
          currentRound={currentRound}
        />
        <h5>Last weeks Results (Round {currentRound - 1})</h5>
        <Table aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell align="right">Top 8 Selection</TableCell>
              <TableCell align="right">Bottom 10 Selection</TableCell>
              <TableCell align="right">Correct Selections</TableCell>
              <TableCell align="right">Margin</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lastRoundResults
              ? lastRoundResults.map((user) => {
                  return (
                    <TableRow key={user._id}>
                      <TableCell>
                        {user.userDetail[0].firstName}{" "}
                        {user.userDetail[0].lastName}
                      </TableCell>
                      <TableCell align="right">
                        {user.topEightSelection}{" "}
                        {user.marginTopEight
                          ? "(" + user.marginTopEight + ")"
                          : ""}
                      </TableCell>
                      <TableCell align="right">
                        {user.bottomTenSelection}{" "}
                        {user.marginBottomTen
                          ? "(" + user.marginBottomTen + ")"
                          : ""}
                      </TableCell>
                      <TableCell align="right"></TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>

        <Link to={{ pathname: "/TipsPage" }}>
          <Button variant="contained" color="primary">
            {currentRoundSelections ? (
              <span>Edit Round {currentRound} Tips</span>
            ) : (
              <span>Enter Round {currentRound} Tips</span>
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

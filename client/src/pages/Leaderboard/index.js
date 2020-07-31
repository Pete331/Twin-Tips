import React, { useState, useEffect } from "react";
import API from "../../utils/TipsAPI";
import Navbar from "../../components/Navbar";
import Container from "@material-ui/core/Container";
import Footer from "../../components/Footer";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Box from "@material-ui/core/Box";

const Leaderboard = () => {
  const roundWinnings = 5;

  const [userResults, setUserResults] = useState([]);
  useEffect(() => {
    getLeaderboardFunction();
  }, []);

  function getLeaderboardFunction() {
    API.getLeaderboard()
      .then((results) => {
        const leaderboard = results.data;
        // console.log(leaderboard);
        let buildResult = [];
        let user = "";
        let entries = 0;
        let winnings = 0;
        let data = {};
        // check if different users and builds result array.
        leaderboard.forEach((tip) => {
          if (
            user ===
            tip.userDetail[0].firstName + " " + tip.userDetail[0].lastName
          ) {
            entries++;
            winnings = winnings + tip.winnings;
          } else {
            // console.log(data);
            buildResult = [...buildResult, data];

            user =
              tip.userDetail[0].firstName + " " + tip.userDetail[0].lastName;
            entries = 1;
            winnings = tip.winnings;
          }

          data = { user: user, entries: entries, winnings: winnings };
        });
        buildResult = [...buildResult, data];
        // adds the final user after foreach function and drops first item(as its empty)
        buildResult.shift();
        console.log(buildResult);
        setUserResults(buildResult);
      })
      .catch((err) => console.log(err));
  }

  return (
    <div>
      <Navbar />
      <Container className="container">
        <div>
          <h4>Leaderboard</h4>
          <Box boxShadow={3} p={1} mb={2} className="Box">
          <Table aria-label="simple table">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell align="right">Entries (Cost)</TableCell>
                <TableCell align="right">Winnings</TableCell>
                <TableCell align="right">Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {userResults
                ? userResults.map((user) => {
                    return (
                      <TableRow key={user.user}>
                        <TableCell>{user.user}</TableCell>
                        <TableCell align="right">
                          {user.entries} (${user.entries * roundWinnings})
                        </TableCell>
                        <TableCell align="right">
                          ${user.winnings * roundWinnings}
                        </TableCell>
                        <TableCell
                          align="right"
                          style={{
                            backgroundColor:
                              user.winnings * roundWinnings -
                                user.entries * roundWinnings >
                              0
                                ? "#50c878"
                                : "#FF4D4D",
                          }}
                        >
                          $
                          {user.winnings * roundWinnings -
                            user.entries * roundWinnings}
                        </TableCell>
                      </TableRow>
                    );
                  })
                : null}
            </TableBody>
          </Table>
          </Box>
        </div>
      </Container>
      <Footer />
    </div>
  );
};

export default Leaderboard;

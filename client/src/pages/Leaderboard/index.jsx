import React, { useState, useEffect, useContext } from "react";
import API from "../../utils/TipsAPI";
import { SeasonContext } from "../../utils/SeasonContext";
import Loader from "../../components/Loader";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import { makeStyles } from "@material-ui/core/styles";
import InputLabel from "@material-ui/core/InputLabel";
import Container from "@material-ui/core/Container";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Box from "@material-ui/core/Box";
const Leaderboard = () => {
  const roundWinnings = 5;

  // A round's pot is split between however many people tied for it, so winnings
  // are frequently thirds. Without rounding the table prints values like
  // $179.16666666666669.
  const money = (amount) => {
    const value = Math.round((Number(amount) || 0) * 100) / 100;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  };

  const { seasonState, availableSeasons } = useContext(SeasonContext);

  const [isLoading, setIsLoading] = useState(true);
  // Starts empty and follows the server's current season, rather than opening
  // on a year that was hardcoded when the page was written.
  const [season, setSeason] = useState(null);
  const [userResults, setUserResults] = useState();

  useEffect(() => {
    if (seasonState && season === null) {
      setSeason(seasonState.season);
    }
  }, [seasonState]);

  useEffect(() => {
    if (userResults) {
      loadingTimeout();
    }
  }, [userResults]);

  useEffect(() => {
    if (season !== null) {
      getLeaderboardFunction();
    }
  }, [season]);

  function getLeaderboardFunction() {
    API.getLeaderboard({ season: season })
      .then((results) => {
        const leaderboard = results.data;
        console.log(leaderboard);
        let buildResult = [];
        let user = "";
        let entries = 0;
        let winnings = 0;
        let data = {};
        // check if different users and builds result array.
        leaderboard.forEach((tip) => {
          // console.log(season);
          if (season === tip.season) {
            // console.log(tip.season);
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
          }
        });
        buildResult = [...buildResult, data];
        // adds the final user after foreach function and drops first item(as its empty)
        buildResult.shift();
        // console.log(buildResult);
        const sortedBuildResult = buildResult.sort((a, b) => {
          return b.winnings - a.winnings;
        });
        console.log(sortedBuildResult);

        setUserResults(sortedBuildResult);
      })
      .catch((err) => console.log(err));
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
    }, 100);
  };
  const classes = useStyles();
  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : (
        <Container className="container" maxWidth="sm">
          <h4>Leaderboard</h4>
          <Box boxShadow={3} p={1} mb={2} className="Box">
            <FormControl className={classes.formControl}>
              <InputLabel id="select-season">Season</InputLabel>
              <Select
                labelId="select-season"
                value={season ? season : ""}
                onChange={seasonHandleChange}
              >
                {/* Driven by whatever seasons the database actually holds, so
                    a new season appears here on its own. */}
                {availableSeasons.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Table aria-label="simple table">
              <TableHead>
                <TableRow>
                  <TableCell>Player</TableCell>
                  <TableCell
                    align="right"
                    style={{ borderLeft: "1px solid lightGrey" }}
                  >
                    Entries (Cost)
                  </TableCell>
                  <TableCell
                    align="right"
                    style={{ borderLeft: "1px solid lightGrey" }}
                  >
                    Winnings
                  </TableCell>
                  <TableCell
                    align="right"
                    style={{ borderLeft: "1px solid lightGrey" }}
                  >
                    Balance
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {userResults
                  ? userResults.map((user) => {
                      return (
                        <TableRow key={user.user}>
                          <TableCell>{user.user}</TableCell>
                          <TableCell
                            align="right"
                            style={{ borderLeft: "1px solid lightGrey" }}
                          >
                            {user.entries} (${user.entries * roundWinnings})
                          </TableCell>
                          <TableCell
                            align="right"
                            style={{ borderLeft: "1px solid lightGrey" }}
                          >
                            ${money(user.winnings * roundWinnings)}
                          </TableCell>
                          <TableCell
                            align="right"
                            style={{
                              borderLeft: "1px solid lightGrey",
                              backgroundColor:
                                user.winnings * roundWinnings -
                                  user.entries * roundWinnings >
                                0
                                  ? "#50c878"
                                  : "#FF4D4D",
                            }}
                          >
                            $
                            {money(
                              user.winnings * roundWinnings -
                                user.entries * roundWinnings
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  : null}
              </TableBody>
            </Table>
          </Box>
        </Container>
      )}
    </div>
  );
};

export default Leaderboard;

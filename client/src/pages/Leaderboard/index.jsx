import { useState, useEffect, useContext, useRef } from "react";
import API from "../../utils/TipsAPI";
import { SeasonContext } from "../../utils/SeasonContext";
import Loader from "../../components/Loader";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { makeStyles } from '../../utils/muiStyles';
import InputLabel from "@mui/material/InputLabel";
import Container from "@mui/material/Container";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

// Defined once, at module scope. Called inside the component body it rebuilt
// the style object and re-serialised it through emotion on every render, which
// is exactly what defining it once is meant to avoid.
const useStyles = makeStyles((theme) => ({
  formControl: {
    margin: theme.spacing(1),
    minWidth: 120,
  },
  selectEmpty: {
    marginTop: theme.spacing(2),
  },
}));
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
            // The username, which is what people are known by here now. The
            // grouping below relies on tips arriving sorted by user, so this
            // has to be the same expression in both places.
            if (user === tip.userDetail[0].username) {
              entries++;
              winnings = winnings + tip.winnings;
            } else {
              // console.log(data);
              buildResult = [...buildResult, data];

              user = tip.userDetail[0].username;
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
        setUserResults(sortedBuildResult);
      })
      .catch((err) => console.log(err));
  }

  function seasonHandleChange(event) {
    setSeason(event.target.value);
  }

  // Held in a ref so it can actually be cancelled. This used to call
  // clearTimeout(this), where `this` is not the timer handle and the call
  // does nothing - leaving a timer that fires after the component has gone
  // and sets state on it.
  const loadingTimer = useRef();

  useEffect(() => () => clearTimeout(loadingTimer.current), []);

  const loadingTimeout = () => {
    clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setIsLoading(false), 100);
  };
  const classes = useStyles();
  return (
    <div>
      {isLoading ? (
        <Loader />
      ) : (
        <Container maxWidth="sm">
          <Typography variant="h5" component="h1" gutterBottom>
            Leaderboard
          </Typography>
          <Box
            sx={{
              boxShadow: 3,
              p: 1,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <FormControl className={classes.formControl}>
              <InputLabel id="select-season">Season</InputLabel>
              <Select
                labelId="select-season"
                label="Season"
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

import { useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import { Link } from "react-router-dom";
import API from "../../utils/TipsAPI";
import Loader from "../../components/Loader";
import DashboardCurrentRoundSelections from "../../components/DashboardCurrentRoundSelections";
import Container from "@mui/material/Container";
import RoundStatus from "../../components/RoundStatus";

import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { makeStyles } from '../../utils/muiStyles';
import InputLabel from "@mui/material/InputLabel";
import Alert from "../../components/Alerts";
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

// What a selection scored, as a colour. 1 is a win, 0.5 a draw, 0 a loss;
// null is a game not yet played and stays uncoloured.
//
// These were booleans until draws began counting half a win, so the checks
// were === true and === false. Blue for the draw rather than an amber, which
// would have sat too close to the gold marking the round winner's row.
const selectionColour = (points) =>
  points === 1
    ? "rgba(80,200,120,.6)"
    : points === 0.5
    ? "rgba(120,160,200,.6)"
    : points === 0
    ? "rgb(255,77,76,.6)"
    : "";

// The competition is over for the year: finals are on, the home-and-away
// rounds are done, or every fixture has been played. Distinct from lockout,
// which is also true while a normal round is in progress.
const seasonOver = (state) =>
  Boolean(
    state && (state.isFinals || state.homeAndAwayComplete || state.seasonComplete)
  );

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const { seasonState } = useContext(SeasonContext);
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

    // Open on the round that has results to show. Once the competition is done
    // for the season the current round is one nobody entered - during finals it
    // has no tips at all - and the table reads "No Selections to display" until
    // the dropdown is changed by hand. The Tips page picks the same round.
    //
    // Deliberately not keyed on tippingOpen: that is also false during an
    // ordinary mid-round lockout, where the current round is exactly what
    // someone wants to see - everyone's locked-in selections for the game on.
    const opening =
      seasonOver(seasonState) &&
      seasonState.lastCompletedRound !== null &&
      seasonState.lastCompletedRound !== undefined
        ? seasonState.lastCompletedRound
        : seasonState.currentRound;

    setRound((current) =>
      current === undefined || current === null ? opening : current
    );
  }, [seasonState]);

  // The round and lockout used to be reverse-engineered here from the dates of
  // the next and previous fixtures, with a three hour fudge for match duration.
  // GET /api/season answers both directly now, and knows about finals, so that
  // logic lives on the server - see services/season.js.

  // Downloading the round from Squiggle and posting it into the fixtures
  // collection used to happen here, on every dashboard load during a round.
  // It let any signed-in visitor rewrite match scores, and nothing on this
  // page used the result - the fixtures below are read from the database.
  // The scheduled sync keeps them current instead; see services/seasonSync.js.

  // added initial mount so that isnt called on mount
  useEffect(() => {
    // results in table
    if (round) {
      roundResult({ round: round });
    }
  }, [round]);

  useEffect(() => {
    // shows current round tips on top of dashboard if done
    currentRoundTips({ user: user.id, round: currentRound });

    // Results used to be calculated here, on every dashboard load, by whoever
    // happened to be visiting - writing scores and winnings for every user in
    // the competition. Scoring now happens on the server when a round
    // completes; see services/results.js.
    loadingTimeout();
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



  // Held in a ref so it can actually be cancelled. This used to call
  // clearTimeout(this), where `this` is not the timer handle and the call
  // does nothing - leaving a timer that fires after the component has gone
  // and sets state on it.
  const loadingTimer = useRef();

  useEffect(() => () => clearTimeout(loadingTimer.current), []);

  const loadingTimeout = () => {
    clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setIsLoading(false), 300);
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
        <Container maxWidth="md">
          <div>
            <Typography variant="h5" component="h1" gutterBottom>
              Welcome {user.name}
            </Typography>
          </div>
          <RoundStatus />
          {currentRoundSelections ? (
            <Grid size={{ xs: 12, sm: 8 }}>
              <Box
                sx={{
                  boxShadow: 3,
                  p: 0.5,
                  mb: 2,
                  bgcolor: "background.paper"
                }}>
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
          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              mb: 2,
              bgcolor: "background.paper"
            }}>
            <FormControl className={classes.formControl}>
              <InputLabel id="select-round">Round</InputLabel>
              <Select
                labelId="select-round"
                label="Round"
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
              // TableContainer, so a table too wide for the screen scrolls
              // inside its own box. A bare Table cannot shrink below the width
              // its columns need - "Greater Western Sydney" beside a margin
              // sets a floor - so it pushed the whole document wide instead.
              // The page then scrolled sideways, and the footer, being the
              // width of the viewport rather than of the scrollable area,
              // stopped short of the right-hand edge.
              //
              // Left at this indentation rather than shifting the 140 lines
              // below it, which would have buried a two-line change.
              <TableContainer>
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
                              {user.userDetail[0].username}
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
                                  backgroundColor: selectionColour(
                                    user.topEightCorrect
                                  ),
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
                                  backgroundColor: selectionColour(
                                    user.bottomTenCorrect
                                  ),
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
              </TableContainer>
            ) : (
              <Typography>No Selections to display</Typography>
            )}
          </Box>
          <Link to={{ pathname: "/TipsPage" }}>
            <Button variant="contained" color="primary">
              {/* Once the competition is finished for the season the link leads
                  to results, not tips. It used to read "View Round 25 Tips"
                  during finals - a round nobody tipped and never could - while
                  the page it opened showed round 24's results. */}
              {seasonOver(seasonState) &&
              seasonState.lastCompletedRound !== null &&
              seasonState.lastCompletedRound !== undefined ? (
                <span>View Round {seasonState.lastCompletedRound} Results</span>
              ) : !lockout ? (
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

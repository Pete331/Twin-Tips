import { useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import RoundPicker from "../../components/RoundPicker";
import { twinTipsRounds, lastTwinTipsRound, roundLabeller } from "../../utils/rounds";
import { typeName } from "../../utils/leagueTypes";
import LeagueAPI from "../../utils/LeagueAPI";
import MuiLink from "@mui/material/Link";
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
import Alert from "../../components/Alerts";
import Typography from "@mui/material/Typography";

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

// 1st, 2nd, 3rd, 4th. Same shape as the fixture card ordinals, kept separate
// because that one is about ladder positions on a fixture and this is about
// places in a table - and a shared one would have to please both.
const ordinal = (n) => {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return n + "th";
  return n + (["th", "st", "nd", "rd"][n % 10] || "th");
};

// The competition is over for the year: finals are on, the home-and-away
// rounds are done, or every fixture has been played. Distinct from lockout,
// which is also true while a normal round is in progress.
const seasonOver = (state) =>
  Boolean(
    state && (state.isFinals || state.homeAndAwayComplete || state.seasonComplete)
  );

const Home = () => {
  const { user } = useContext(AuthContext);
  const { seasonState } = useContext(SeasonContext);
  const alertRef = useRef();

  const [isLoading, setIsLoading] = useState(true);
  const [lockout, setLockout] = useState(true);
  const [roundResults, setRoundResults] = useState();
  const [rankings, setRankings] = useState();
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
    // has no tips at all - and the table reads "No tips to display" until
    // the dropdown is changed by hand. The Tips page picks the same round.
    //
    // Deliberately not keyed on tippingOpen: that is also false during an
    // ordinary mid-round lockout, where the current round is exactly what
    // someone wants to see - everyone's locked-in selections for the game on.
    // Both branches go through lastTwinTipsRound, which holds the answer
    // inside the round list the picker offers. Opening on a round the list no
    // longer has - lastCompletedRound is a finals round once the finals start
    // - leaves the picker blank with two dead arrows, since the value matches
    // no item in it.
    const opening = seasonOver(seasonState)
      ? lastTwinTipsRound(seasonState)
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

  // Keyed on the season rather than the round: a place only moves when a round
  // is scored, and the season state changing is the closest signal to that the
  // page has. Failure is quiet - the table simply does not appear, which is
  // the right outcome for something the page works fine without.
  useEffect(() => {
    if (!seasonState || seasonState.season === null) return;
    LeagueAPI.rankings(seasonState.season)
      .then((res) => setRankings(res.data.rankings || []))
      .catch(() => setRankings([]));
  }, [seasonState]);

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

  // Rounds the user can look back at. Capped at the last home-and-away round
  // rather than running to currentRound - see utils/rounds.
  const roundOptions = twinTipsRounds(seasonState);

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
            {/* roundOptions is generated from the season state: the list used
                to be 23 hand-written entries starting at Round 1, so it could
                not show Round 0 (the Opening Round) and stopped at 23 even
                when the season ran longer. */}
            <RoundPicker
              id="select-round"
              label="Round"
              value={round}
              options={roundOptions}
              getOptionLabel={roundLabeller(seasonState && seasonState.roundNames)}
              onChange={setRound}
            />
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
                      Top 8 Tip
                    </TableCell>
                    <TableCell
                      align="right"
                      style={{
                        borderLeft: "1px solid lightGrey",
                        paddingLeft: "5px",
                        paddingRight: "5px",
                      }}
                    >
                      Bottom 10 Tip
                    </TableCell>
                    <TableCell
                      align="right"
                      style={{
                        borderLeft: "1px solid lightGrey",
                        paddingLeft: "5px",
                        paddingRight: "5px",
                      }}
                    >
                      Correct Tips & Margin
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
              <Typography>No tips to display</Typography>
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

          {/* Where you stand, everywhere you stand. The leaderboard shows one
              table at a time behind a picker; this answers the question
              someone opens the app for without making them choose a league
              first.

              Rendered only once it has arrived. An empty table with a heading
              over it says "you are in nothing", which is a different and wrong
              answer to "this has not loaded yet". */}
          {rankings && rankings.length ? (
            <Box sx={{ boxShadow: 3, p: 2, pt: 1, mb: 2, bgcolor: "background.paper" }}>
              <Typography variant="h6" component="h2" gutterBottom>
                My rankings
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    {rankings.map((entry) => (
                      <TableRow key={entry.slug || "global"}>
                        <TableCell sx={{ borderBottom: "none" }}>
                          {/* The global ladder has no page of its own; the
                              leaderboard opens on it without a league. */}
                          <MuiLink
                            component={Link}
                            to={
                              entry.slug
                                ? `/leaderboard?league=${entry.slug}`
                                : "/leaderboard"
                            }
                            sx={{ fontWeight: 700 }}
                          >
                            {entry.name}
                          </MuiLink>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.secondary" }}
                          >
                            {entry.type === "global"
                              ? "Everyone in Twin Tips"
                              : typeName(entry.type)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ borderBottom: "none" }}>
                          {/* A rank of null means this user is not in the
                              table at all - a league joined after the last
                              scored round, most likely. Saying so beats
                              printing an ordinal for a place they do not
                              hold. */}
                          <Typography sx={{ fontWeight: 700 }}>
                            {entry.rank === null
                              ? "-"
                              : `${entry.tied ? "=" : ""}${ordinal(entry.rank)}`}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.secondary" }}
                          >
                            of {entry.of}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : null}
        </Container>
      )}
    </div>
  );
};

export default Home;

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
import {
  PageSkeleton,
  Panel,
  TitleSkeleton,
  PickerSkeleton,
  TableSkeleton,
} from "../../components/Skeletons";
import DashboardCurrentRoundSelections from "../../components/DashboardCurrentRoundSelections";
import Container from "@mui/material/Container";
import RoundStatus from "../../components/RoundStatus";
import Updating from "../../components/Updating";
import LoadFailure from "../../components/LoadFailure";
import { describeRequestError } from "../../utils/http";

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
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { visuallyHidden } from "@mui/utils";
import { byResult, marginError } from "../../utils/roundOrder";
import { GREEN, BLUE, RED } from "../../utils/resultTint";

// What a selection scored, as a background. 1 is a win, 0.5 a draw, 0 a loss;
// null is a game not yet played and stays uncoloured.
//
// These were booleans until draws began counting half a win, so the checks
// were === true and === false.
//
// Opaque tints rather than the saturated fills at .6 alpha that were here
// before. The alpha was the bug: the gold marking the round winner was set on
// the row, so a winner's cells painted green-and-red over gold and came out a
// darker green and an orange. The person who won the round was the one whose
// result was hardest to read. Nothing composites now - every fill is solid, so
// a cell is one of three colours whoever is in it.
//
// The colours themselves live in utils/resultTint, shared with the pool
// balances and the fixture cards.
const selectionTint = (points) =>
  points === 1 ? GREEN : points === 0.5 ? BLUE : points === 0 ? RED : "";

// The same three states again, as a shape - because colour on its own does not
// carry this. Red against green is the pair most people with colour blindness
// cannot separate, and it was the only thing saying whether a tip came off.
// A tick, a cross and a dash say it without needing the colour at all, and the
// hidden word says it to a screen reader, which until now was read the team
// name and nothing else.
const SelectionMark = ({ points }) => {
  if (points !== 1 && points !== 0.5 && points !== 0) return null;

  const [Icon, colour, word] =
    points === 1
      ? [CheckCircleIcon, "success.main", "Correct"]
      : points === 0.5
      ? [RemoveCircleIcon, "info.main", "Draw"]
      : [CancelIcon, "error.main", "Incorrect"];

  return (
    <>
      <Icon sx={{ fontSize: 16, color: colour, flex: "0 0 auto" }} />
      <Box component="span" sx={visuallyHidden}>
        {word}
      </Box>
    </>
  );
};

// The order the round was decided in lives in utils/roundOrder, where it can
// be tested. Ranking on a margin has an edge that is easy to get wrong - being
// exactly right is a difference of 0 - and that is worth a test rather than a
// careful reading.

// One of the two picks has nothing to score against yet, so the total can
// still move. Scoring writes null for a selection it could not resolve - no
// game found for the team, or no pick made - as against 0, which means the pick
// lost.
//
// This is the whole meaning of the star now. It used to have a second one: the
// cell also starred a score with no margin recorded anywhere. That branch was
// unreachable for anything the app can produce - POST /api/tips requires both
// selections and exactly one margin, and a margin-carrying pick whose
// difference is null is one whose points are null too, so the other condition
// was already true whenever it fired. Dropping it leaves one marker with one
// meaning, which is what the footnote under the table can then explain.
const awaitingResult = (user) =>
  user.topEightCorrect === null || user.bottomTenCorrect === null;

// Correct tips, and how far off the margin was.
//
// This cell used to print "1 (null)" for anyone who nailed the margin exactly.
// It chose the number with `topEightDifference || bottomTenDifference`, and a
// difference of 0 is falsy, so a perfect margin fell through to the other game
// - which nobody nominated, so it was null, and a template literal writes null
// out as the word. Being exactly right read as an error.
//
// marginError is the same check the sort uses, which is why those rows were
// already at the top of the table while the cell beside them said null.
const roundScore = (user) => {
  if (user.correctTips === undefined) return "";

  const error = marginError(user);
  return `${awaitingResult(user) ? "*" : ""}${user.correctTips}${
    error === null ? "" : ` (${error})`
  }`;
};

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

  // The results table is keyed to the round picker above it, so changing the
  // round left last round's rows in place until the new ones arrived. Faded
  // rather than cleared: the table is the right shape already and only the
  // numbers change.
  const [updatingRound, setUpdatingRound] = useState(false);
  // Set when the results table cannot be fetched.
  const [loadError, setLoadError] = useState(null);
  // Drops a late reply from a round already moved past.
  const resultsRequest = useRef(0);
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
    if (!round) return;

    const batch = ++resultsRequest.current;
    const current = () => resultsRequest.current === batch;

    setUpdatingRound(true);
    roundResult({ round: round }, current).finally(() => {
      if (current()) setUpdatingRound(false);
    });
  }, [round]);

  useEffect(() => {
    // shows current round tips on top of dashboard if done
    //
    // Cleared when the request finishes rather than the moment it is sent.
    // This used to fire the fetch and set loading false on the next line, so
    // the page had no loading state tied to its data at all - it drew the
    // frame immediately and sat there with empty panels until the round trip
    // came back, which on a slow connection reads as a page that has finished
    // loading and has nothing in it.
    //
    // Results used to be calculated here too, on every dashboard load, by
    // whoever happened to be visiting - writing scores and winnings for every
    // user in the competition. Scoring now happens on the server when a round
    // completes; see services/results.js.
    currentRoundTips({ user: user.id, round: currentRound }).finally(() =>
      setIsLoading(false)
    );
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

  async function roundResult(data, isCurrent = () => true) {
    await API.getRoundResult(data)
      .then((results) => {
        if (!isCurrent()) return;
        setRoundResults(results.data);
        setLoadError(null);
      })
      // The table is what this page is for, so a failure to fetch it is worth
      // saying out loud rather than leaving an empty panel that looks like a
      // round nobody tipped.
      .catch((err) => {
        if (isCurrent()) setLoadError(describeRequestError(err));
      });
  }

  async function currentRoundTips(data) {
    await API.getCurrentRoundTips(data)
      .then((results) => {
        setCurrentRoundSelections(results.data);
      })
      // Deliberately quiet. This fills the "your tips this round" panel, which
      // is hidden entirely when there is nothing to show - so a failure here
      // costs a summary of something the page below it already displays, and
      // an error bar for it would be louder than what it is reporting.
      .catch(() => setCurrentRoundSelections(undefined));
  }

  // The ladder used to be refreshed from here: whenever someone loaded the
  // dashboard outside a lockout, and only if the stored ladder was more than
  // three days old. That meant the ladder only ever updated if a human happened
  // to visit, and because rounds run about a week, the three-day check fired
  // mid-round as often as not - moving teams between the top 8 and the bottom
  // 10 after people had already tipped. Snapshots are now taken server-side
  // when a round completes; see services/seasonSync.js.


  // Rounds the user can look back at. Capped at the last home-and-away round
  // rather than running to currentRound - see utils/rounds.
  const roundOptions = twinTipsRounds(seasonState);

  // The table's rows, in the order the round was decided.
  //
  // Left alone while a round is open and everyone's tips are still hidden.
  // There is no result to rank then, and ordering rows by a score the viewer
  // cannot see would be a way of showing it to them.
  //
  // Copied before sorting, because sort is in place and roundResults is state.
  const orderedResults =
    !roundResults || (round === currentRound && !lockout)
      ? roundResults || []
      : [...roundResults].sort(byResult);

  return (
    <div>
      {isLoading ? (
        <PageSkeleton maxWidth="md">
          {/* "Welcome <name>", the round status, then the panel holding the
              round picker and the rankings table. */}
          <TitleSkeleton />
          <Panel sx={{ p: 0.5 }}>
            <TableSkeleton rows={2} columns={3} />
          </Panel>
          <Panel>
            <PickerSkeleton />
            <TableSkeleton rows={3} columns={2} />
          </Panel>
        </PageSkeleton>
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

            {loadError ? (
              <LoadFailure
                message={loadError}
                onRetry={() => roundResult({ round: round })}
              />
            ) : roundResults && roundResults.length ? (
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
              <Updating busy={updatingRound}>
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
                      Top 8 tip
                    </TableCell>
                    <TableCell
                      align="right"
                      style={{
                        borderLeft: "1px solid lightGrey",
                        paddingLeft: "5px",
                        paddingRight: "5px",
                      }}
                    >
                      Bottom 10 tip
                    </TableCell>
                    <TableCell
                      align="right"
                      style={{
                        borderLeft: "1px solid lightGrey",
                        paddingLeft: "5px",
                        paddingRight: "5px",
                      }}
                    >
                      Correct tips & margin
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {roundResults
                    ? orderedResults.map((user) => {
                        return (
                          <TableRow
                            key={user._id}
                            style={{
                              // A wash rather than the solid gold that used to
                              // sit here. The tip cells paint over it, so
                              // anything strong only reached the columns that
                              // had nothing to say.
                              backgroundColor: user.winnings ? "#fffaf0" : "",
                            }}
                          >
                            <TableCell
                              style={{
                                paddingLeft: "5px",
                                paddingRight: "5px",
                                // The gold now lives on the name, where nothing
                                // else is competing for the cell.
                                boxShadow: user.winnings
                                  ? "inset 3px 0 0 #e0a800"
                                  : "",
                              }}
                            >
                              <Box
                                component="span"
                                sx={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 0.75,
                                }}
                              >
                                {user.winnings ? (
                                  <>
                                    <EmojiEventsIcon
                                      sx={{ fontSize: 16, color: "#e0a800" }}
                                    />
                                    <Box component="span" sx={visuallyHidden}>
                                      Round winner
                                    </Box>
                                  </>
                                ) : null}
                                {user.userDetail[0].username}
                              </Box>
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
                                  backgroundColor: selectionTint(
                                    user.topEightCorrect
                                  ),
                                }}
                              >
                                <Box
                                  component="span"
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "flex-end",
                                    gap: 0.75,
                                  }}
                                >
                                  <span>
                                    {user.topEightSelection}{" "}
                                    {user.marginTopEight
                                      ? "(" + user.marginTopEight + ")"
                                      : ""}
                                  </span>
                                  <SelectionMark points={user.topEightCorrect} />
                                </Box>
                              </TableCell>
                            )}
                            {user.round === currentRound && !lockout ? (
                              <TableCell></TableCell>
                            ) : (
                              <TableCell
                                align="right"
                                style={{
                                  borderLeft: "1px solid lightGrey",
                                  backgroundColor: selectionTint(
                                    user.bottomTenCorrect
                                  ),
                                  paddingLeft: "5px",
                                  paddingRight: "5px",
                                }}
                              >
                                <Box
                                  component="span"
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "flex-end",
                                    gap: 0.75,
                                  }}
                                >
                                  <span>
                                    {user.bottomTenSelection}{" "}
                                    {user.marginBottomTen
                                      ? "(" + user.marginBottomTen + ")"
                                      : ""}
                                  </span>
                                  <SelectionMark
                                    points={user.bottomTenCorrect}
                                  />
                                </Box>
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
                                {roundScore(user)}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    : null}
                </TableBody>
              </Table>
              </TableContainer>

              {/* Only when there is a star above it to explain. A legend for a
                  marker nobody can see is a line that has to be read and then
                  discarded, on the page people open most. */}
              {orderedResults.some(awaitingResult) ? (
                <Typography
                  variant="caption"
                  sx={{ display: "block", mt: 1, px: "5px", color: "text.secondary" }}
                >
                  * Not final - awaiting a result
                </Typography>
              ) : null}
              </Updating>
            ) : (
              <Typography>No tips to display</Typography>
            )}
          </Box>
          <Link to={{ pathname: "/TipsPage" }}>
            {/* mb, because the rankings below now sit directly under this and
                the button had no space beneath it - it was only ever the last
                thing on the page before. */}
            <Button variant="contained" color="primary" sx={{ mb: 2 }}>
              {/* Once the competition is finished for the season the link leads
                  to results, not tips. It used to read "View Round 25 Tips"
                  during finals - a round nobody tipped and never could - while
                  the page it opened showed round 24's results. */}
              {seasonOver(seasonState) &&
              seasonState.lastCompletedRound !== null &&
              seasonState.lastCompletedRound !== undefined ? (
                <span>View round {seasonState.lastCompletedRound} results</span>
              ) : !lockout ? (
                currentRoundSelections ? (
                  <span>Edit round {currentRound} tips</span>
                ) : (
                  <span>Enter round {currentRound} tips</span>
                )
              ) : (
                <span>View round {currentRound} tips</span>
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

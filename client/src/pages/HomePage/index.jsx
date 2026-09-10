import { Fragment, useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import RoundPicker from "../../components/RoundPicker";
import TipCell from "../../components/TipCell";
import { inDollars } from "../../utils/money";
import {
  twinTipsRounds,
  lastTwinTipsRound,
  roundLabeller,
  tipsButtonLabel,
} from "../../utils/rounds";
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
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { visuallyHidden } from "@mui/utils";
import { byResult, marginError } from "../../utils/roundOrder";

// The tint and the mark moved to components/TipCell, which the leaderboard's
// round table now uses as well. Two tables showing the same thing had two
// copies of how to show it, which is how they drift apart.
//
// Worth keeping the note that came with them: the tints are opaque rather than
// the saturated fills at .6 alpha that were here before. The alpha was the bug
// - the gold marking the round winner sits on the row, so a winner's cells
// painted green-and-red over gold and came out a darker green and an orange.
// The person who won the round was the one whose result was hardest to read.
// Nothing composites now, so a cell is one of three colours whoever is in it.

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

// Three columns of text on a 375px phone, so the padding has to give.
//
// MUI pads a small cell 16px each side, which is 96px of a screen that holds
// about 343 once the page's own margins are off - more than a quarter of the
// width, spent on nothing, while "This league started at round 26" wraps to
// three lines beside it. Two pixels here and the columns get it back.
//
// The first and last cells lose their outer padding entirely: there is already
// the card's own padding outside them, and doubling it only pushes the table
// away from both edges.
//
// Full padding from sm up, where there is room and the table would otherwise
// look cramped for no reason.
const cramped = {
  "& .MuiTableCell-root": {
    px: { xs: 0.25, sm: 2 },
    "&:first-of-type": { pl: { xs: 0, sm: 2 } },
    "&:last-of-type": { pr: { xs: 0, sm: 2 } },
  },
};

// The round column for one league.
//
// Labels lighter than the values, because the same two words repeat down every
// row of the table and the names and placings beside them do not. At full
// weight seven rows of "Winner:" is the loudest thing in the column; faded,
// the eye lands on what changes and reads the label only when it needs to.
// A line's value, with the part about you picked out.
//
// The column is read at a glance down seven leagues, and the one thing being
// looked for is whether it says you - so that word is the one carrying weight,
// not the label in front of it and not the name you shared the round with.
//
// "you" bolds only your name: the names are joined with " and ", so splitting on
// that gives them back and yours can be found wherever in the list it fell.
// Bolding the whole value would emphasise whoever you tied with just as much,
// which is the opposite of the point.
//
// "all" bolds the lot, which is what an amount wants - there is no part of $60
// that is about somebody else.
const Value = ({ value, emphasis }) => {
  if (emphasis === "all") {
    return (
      <Box component="span" sx={{ fontWeight: 700 }}>
        {value}
      </Box>
    );
  }

  if (emphasis !== "you") return value;

  return value.split(" and ").map((part, index) => (
    <Fragment key={part}>
      {index > 0 ? " and " : null}
      {part === "You" || part === "You!" ? (
        <Box component="span" sx={{ fontWeight: 700 }}>
          {part}
        </Box>
      ) : (
        part
      )}
    </Fragment>
  ));
};

const RoundCell = ({ summary }) => {
  if (!summary) return <Typography variant="body2">–</Typography>;

  if (summary.note) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {summary.note}
      </Typography>
    );
  }

  return summary.lines.map(({ label, value, emphasis }) => (
    <Typography key={label} variant="body2" sx={{ whiteSpace: "nowrap" }}>
      <Box component="span" sx={{ color: "text.disabled" }}>
        {label}:{" "}
      </Box>
      <Value value={value} emphasis={emphasis} />
    </Typography>
  ));
};

// The round column's header, short.
//
// It is the narrowest column on a phone, and the full name is the widest thing
// that could go in it: "Round 14" pushes the header wider than most of the
// cells beneath it, to repeat a word the picker directly above already says in
// full.
//
// Only ever a home-and-away round, because the picker is capped at the last one
// - so there is no "Finals Week 1" here to shorten. Round 0 is the Opening
// Round and stays numbered rather than becoming an initialism nobody reads.
const shortRound = (round) =>
  round === null || round === undefined ? "Round" : `R${round}`;

// 1st, 2nd, 3rd, 4th. Same shape as the fixture card ordinals, kept separate
// because that one is about ladder positions on a fixture and this is about
// places in a table - and a shared one would have to please both.
const ordinal = (n) => {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return n + "th";
  return n + (["th", "st", "nd", "rd"][n % 10] || "th");
};

// What one round did in one league, as a line under its name.
//
// This is the only place the page can name a winner for a league. A round is
// won league by league - the same tips crown different people in two leagues,
// because a winner is decided among that league's members - and the table of
// everyone's tips below has no league to decide one within.
//
// Four things can be true of a league in a round, and they are different
// answers rather than degrees of the same one:
//
//   beforeLeague   the league started later, or the round is one it never runs
//   beforeYou      you joined it after this round
//   noEntries      it ran, and nobody in it tipped
//   scored         it ran and has a result
//
// The empty ones are said rather than left blank. A row that simply stops after
// the league's name reads as something that failed to load.
//
// Exported for its own test: a string is far easier to hold to account than a
// cell, and the page around it needs both contexts, the router and the whole
// API surface stubbed before it will render at all.
// Returns either a note - one unlabelled sentence, for a round this league has
// nothing to say about - or a pair of labelled lines.
//
// Two labelled lines rather than one sentence, because the column is 142px and
// a sentence wrapped wherever it ran out: "samples won, you 3rd" then "of 5",
// with the count orphaned from the number it belongs to. Each line is a whole
// thought now, so a break never lands mid-phrase.
export const roundSummary = (detail) => {
  if (!detail) return null;

  if (detail.status === "beforeLeague") {
    return { note: `This league started at round ${detail.startRound}` };
  }

  const you = detail.you;
  if (you && you.status === "beforeYou") {
    return { note: `You joined at round ${you.joinedAtRound}` };
  }

  if (detail.status === "noEntries") return { note: "Nobody entered this round" };

  const leaders = detail.pays
    ? detail.winners
    : detail.standings.filter((s) => s.rank === 1).map((s) => s.username);

  // "Best" rather than "Winner" on a season league, which has no pool: nobody
  // wins one of its rounds, they simply top it, and naming a winner where there
  // is nothing to win implies a payout. It is also the only label that fits -
  // "Round winner: samples" measures 145px against 142px of column.
  const topLabel = detail.pays ? "Winner" : "Best";

  const lines = [];
  const iAmTop = Boolean(you && you.rank === 1);

  // Your own name, where it appears among the leaders, reads as "You".
  //
  // A shared top is the case this is for. "Best: You!" on its own would erase
  // whoever tied, and naming everybody by username leaves you hunting for your
  // own to work out whether you are in the list - so the list stays whole and
  // one name in it becomes the second person.
  const named = leaders.map((name) =>
    you && name === you.username ? "You" : name
  );

  if (leaders.length) {
    lines.push({
      label: topLabel,
      // The exclamation is for topping it alone. Sharing is a smaller moment
      // and reads better as a plain list.
      value: iAmTop && leaders.length === 1 ? "You!" : named.join(" and "),
      // Only when one of the names is yours. Marked here rather than worked out
      // by the cell, because this is where it is already known which of the
      // leaders is the reader.
      emphasis: iAmTop ? "you" : undefined,
    });
  }

  if (detail.pays && you && you.winnings) {
    // The amount rather than the placing. Winning is first by definition, and
    // the sum is the thing worth reading - it also carries the pool size, since
    // $30 at a $10 buy-in can only be three entrants.
    lines.push({
      label: "Winnings",
      value: inDollars(you.winnings, detail.buyIn) || "-",
      emphasis: "all",
    });
  } else if (iAmTop) {
    // Nothing to add. A season league pays nothing, so "Best: You!" is the
    // whole story - and "You: 1st of 6" underneath it would only say again
    // what being named as best has already said.
  } else if (you && you.status === "noTip") {
    // Missing a round is a free pass in this competition - nothing goes in and
    // nothing can be won - so it is said rather than shown as a last place.
    lines.push({ label: "You", value: "did not enter" });
  } else if (you && you.rank) {
    lines.push({
      label: "You",
      value: `${you.tied ? "=" : ""}${ordinal(you.rank)} of ${detail.entrants}`,
    });
  }

  return lines.length ? { lines } : null;
};

// The same line for the Overall Site Ladder, which has no league and so no
// league detail to read.
//
// Worked out from the round's tips, which the page already has for the table
// below - the winner is whoever scoring paid, and the placing is a position in
// the order that table is already sorted into. No second request for a figure
// that is sitting in state.
export const siteRoundSummary = (results, userId) => {
  if (!results || !results.length) return { note: "Nobody entered this round" };

  const nameOf = (row) =>
    (row.userDetail && row.userDetail[0] && row.userDetail[0].username) || null;

  const winners = results.filter((r) => r.winnings > 0);
  const mine = results.findIndex((r) => String(r.user) === String(userId));
  const iWon = mine !== -1 && results[mine].winnings > 0;

  // Your own name replaced with "You", the way a league line does it.
  //
  // Matched on the id rather than the name. This is the one row on the page
  // with no league to scope it, so it is drawn from everybody in the app - and
  // the name is the thing being replaced, which makes it the wrong thing to
  // match on.
  const named = winners
    .map((r) => (String(r.user) === String(userId) ? "You" : nameOf(r)))
    .filter(Boolean);

  const lines = [];

  // "Winner" rather than "Best": there is a site-wide pool, and this row is the
  // one place the page says who took it.
  if (named.length) {
    lines.push({
      label: "Winner",
      // The exclamation is for taking it alone, as it is on a league line.
      //
      // Sharing it used to print "You!" and nothing else, which erased whoever
      // you tied with - the same bug the league lines had, and the same fix.
      // Seeded data put the two side by side to be seen: the league row said
      // "You and seeds" and this one, about the same tie, said "You!".
      value: iWon && named.length === 1 ? "You!" : named.join(" and "),
      emphasis: iWon ? "you" : undefined,
    });
  }

  lines.push(
    mine === -1
      ? { label: "You", value: "did not enter" }
      : { label: "You", value: `${ordinal(mine + 1)} of ${results.length}` }
  );

  return { lines };
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
  // What the selected round did in each league the user belongs to.
  const [leagueRounds, setLeagueRounds] = useState();
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
    //
    // Not `if (!round)`. Round 0 is the Opening Round, a real round people tip
    // in, and it is falsy - so the table and the picker disagreed about whether
    // it existed. Only "no round chosen yet" should stop the fetch.
    if (round === null || round === undefined) return;

    const batch = ++resultsRequest.current;
    const current = () => resultsRequest.current === batch;

    setUpdatingRound(true);
    // Alongside rather than after: neither answer needs the other, and chaining
    // them would spend a round trip queueing.
    Promise.allSettled([
      roundResult({ round: round }, current),
      fetchLeagueRounds(round, current),
    ]).finally(() => {
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

  // What the round did in each of your leagues.
  //
  // A round is won league by league: the same tips crown different people in
  // different leagues, because a winner is decided among that league's members.
  // The table below this shows everyone's tips and cannot say who won any of
  // them - it has no league to say it about.
  //
  // Quiet on failure, like the tips panel below. This adds to the round rather
  // than being it, and the league service having a bad day should not put an
  // error over a results table that loaded perfectly well.
  async function fetchLeagueRounds(forRound, isCurrent = () => true) {
    await LeagueAPI.roundEverywhere(forRound, season)
      .then((results) => {
        if (isCurrent()) setLeagueRounds(results.data.leagues || []);
      })
      .catch(() => {
        if (isCurrent()) setLeagueRounds(undefined);
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

  const labelRound = roundLabeller(seasonState && seasonState.roundNames);

  // The round line for a row of the rankings table.
  //
  // The two answers are joined on the slug rather than merged on the server:
  // they are different questions, only one of them moves with the picker, and
  // the league service having a bad day should cost the round line rather than
  // the standing beside it. Returning null where there is no round detail is
  // what makes that degrade quietly instead of emptying the table.
  const summaryFor = (entry) => {
    if (!entry.slug) {
      // The Overall Site Ladder has no league detail. Worked out from the
      // round's own tips - the same rows the table below is drawn from.
      return siteRoundSummary(orderedResults, user && user.id);
    }

    const detail = (leagueRounds || []).find((d) => d.league === entry.slug);
    return roundSummary(detail);
  };

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

          {/* Directly under your own selections, because it is the thing to do
              about them - enter them, change them, or go and watch them. It
              used to sit below the round results, which put the one action on
              the page underneath the longest table on it. */}
          {/* A block of its own, because react-router's Link is an anchor and
              the thing above it is RoundStatus - an inline-flex Box inside a
              Tooltip. Left inline the button sat on the same line and printed
              itself over "The 2026 Twin Tips season is over". It only started
              mattering when the button moved up here; below a table it had a
              block element in front of it and broke the line for free. */}
          <Box sx={{ display: "block", mt: 1 }}>
          <Link to={{ pathname: "/TipsPage" }}>
            <Button variant="contained" color="primary" sx={{ mb: 2 }}>
              {/* The wording and the round both come from tipsButtonLabel, so
                  the round this names is the round the tips page will open on.
                  See utils/rounds.js for why each state says what it does. */}
              <span>
                {tipsButtonLabel(seasonState, {
                  hasSelections: Boolean(currentRoundSelections),
                })}
              </span>
            </Button>
          </Link>
          </Box>

          {/* Where you stand, everywhere you stand. The leaderboard shows one
              table at a time behind a picker; this answers the question
              someone opens the app for without making them choose a league
              first.

              Rendered only once it has arrived. An empty table with a heading
              over it says "you are in nothing", which is a different and wrong
              answer to "this has not loaded yet". */}
          {/* The round the table below is showing.

              Above the rankings now rather than over the tips table, because
              it drives both: each league line reports this round, and the tips
              table under them is the detail behind it. roundOptions comes from
              the season state - the list used to be 23 hand-written entries
              starting at Round 1, so it could not show Round 0 and stopped at
              23 even when the season ran longer. */}
          <Box sx={{ mb: 1 }}>
            <RoundPicker
              id="select-round"
              label="Round"
              value={round}
              options={roundOptions}
              getOptionLabel={labelRound}
              onChange={setRound}
            />
          </Box>

          {rankings && rankings.length ? (
            <Box sx={{ boxShadow: 3, p: 2, pt: 1, mb: 2, bgcolor: "background.paper" }}>
              <Typography variant="h6" component="h2" gutterBottom>
                My leagues
              </Typography>
              <TableContainer>
                <Table size="small" sx={cramped}>
                  {/* The round names itself once, in the header, rather than
                      every cell repeating it. Which matters most in the
                      column it labels: that cell is the narrowest thing on a
                      phone and "Round 24: " was a third of it. */}
                  <TableHead>
                    <TableRow>
                      <TableCell>League</TableCell>
                      <TableCell>{shortRound(round)}</TableCell>
                      <TableCell align="right">Overall</TableCell>
                    </TableRow>
                  </TableHead>
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
                                : // Named, not left to the default. A bare
                                  // /leaderboard opens on the league you have
                                  // been in longest, which is the right
                                  // default for the menu and the wrong
                                  // destination for a link that says Overall
                                  // Site Ladder - it led anywhere but there.
                                  //
                                  // Its own parameter rather than a reserved
                                  // value of ?league=, because a league called
                                  // Global would have the slug that reserved
                                  // value needed.
                                  "/leaderboard?ladder=site"
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

                        {/* What the selected round did in this league. The
                            only column that moves with the picker - the
                            standing beside it is where you stand now,
                            whichever round is being looked at. */}
                        <TableCell sx={{ borderBottom: "none" }}>
                          <RoundCell summary={summaryFor(entry)} />
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

          <Box
            sx={{
              boxShadow: 3,
              p: 2,
              mb: 2,
              bgcolor: "background.paper"
            }}>


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
              {/* Named for the ladder it belongs to - the same name the row
                  above carries, and the same one the leaderboard puts on it.
                  This table is that ladder's round, and the leaderboard now
                  shows the same thing behind its own round picker.

                  The trophy in here is what needed saying out loud: it marks
                  whoever won the round across the whole site, which is not who
                  won it in any particular league. The lines above say that,
                  league by league.

                  So the name appearing twice on this page is the point rather
                  than a slip. The row is where you are placed; this is the
                  round behind it. */}
              <Typography
                variant="subtitle2"
                sx={{ color: "text.secondary", mb: 0.5 }}
              >
                Overall Site Ladder
              </Typography>
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
                      {/* Worded as the leaderboard words it. The two tables
                          show the same round of the same ladder, and had two
                          names for the same column. */}
                      Correct (margin)
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
                              <TipCell
                                team={user.topEightSelection}
                                margin={user.marginTopEight}
                                points={user.topEightCorrect}
                              />
                            )}
                            {user.round === currentRound && !lockout ? (
                              <TableCell></TableCell>
                            ) : (
                              <TipCell
                                team={user.bottomTenSelection}
                                margin={user.marginBottomTen}
                                points={user.bottomTenCorrect}
                              />
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
        </Container>
      )}
    </div>
  );
};

export default Home;

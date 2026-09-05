import { useEffect, useState, useContext, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import { dayKey, dayAndDate } from "../../utils/dates";
import RoundPicker from "../../components/RoundPicker";
import { twinTipsRounds, roundLabeller, defaultTipsRound } from "../../utils/rounds";
import { namesRound, seasonOverLabel } from "../../utils/seasonLabel";
import { useNavigate, Link } from "react-router-dom";
import FixtureCard from "../../components/FixtureCard";
import Updating from "../../components/Updating";
import LoadFailure from "../../components/LoadFailure";
import RoundStatus from "../../components/RoundStatus";
import {
  PageSkeleton,
  Panel,
  PickerSkeleton,
  FixtureDaysSkeleton,
} from "../../components/Skeletons";
import API from "../../utils/TipsAPI";
import { describeRequestError } from "../../utils/http";
import Container from "@mui/material/Container";
import MuiAlert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormGroup from "@mui/material/FormGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Alert from "../../components/Alerts";
import Box from "@mui/material/Box";
import { visuallyHidden } from "@mui/utils";

const TipsPage = () => {
  const { user } = useContext(AuthContext);
  const { seasonState } = useContext(SeasonContext);
  const navigate = useNavigate();
  const alertRef = useRef();

  const [isLoading, setIsLoading] = useState(true);
  const [currentRound, setCurrentRound] = useState();
  const [round, setRound] = useState();
  const [roundFixture, setRoundFixture] = useState();
  const [topEightSelection, setTopEightSelection] = useState();
  const [bottomTenSelection, setBottomTenSelection] = useState();
  const [marginTopEight, setMarginTopEight] = useState();
  const [marginBottomTen, setMarginBottomTen] = useState();
  const [lockout, setLockout] = useState();
  const [lastRoundSelectionT8, setLastRoundSelectionT8] = useState();
  const [lastRoundSelectionB10, setLastRoundSelectionB10] = useState();
  const [modelResults, setModelResults] = useState();
  // Keyed by game id, so a card looks its own price up rather than scanning.
  const [odds, setOdds] = useState();

  // True from the moment a round is picked until its data has landed. Distinct
  // from isLoading, which is the first paint: this one has content on screen to
  // fade rather than nothing to stand in for.
  const [updatingRound, setUpdatingRound] = useState(false);
  // Set when the fixtures cannot be fetched, so the page can say so instead of
  // reporting the round as empty.
  const [loadError, setLoadError] = useState(null);
  // Bumped by the retry button. The effect below keys on it as well as on the
  // round, so asking again for the same round actually re-runs it - setting
  // round to the value it already holds would change nothing.
  const [retry, setRetry] = useState(0);
  const retryRound = () => setRetry((n) => n + 1);
  // Identifies the in-flight batch, so a late response from a round you have
  // already moved past is dropped instead of overwriting the current one.
  const roundRequest = useRef(0);

  function submitTips() {
    if (
      topEightSelection === undefined ||
      topEightSelection === null ||
      bottomTenSelection === undefined ||
      bottomTenSelection === null
    ) {
      alertRef.current.createAlert("error", "You need to select 2 teams", true);
      return;
    }
    if (
      (marginTopEight === undefined ||
        marginTopEight === null ||
        marginTopEight === "" ||
        marginTopEight === "0" ||
        marginTopEight === 0) &&
      (marginBottomTen === undefined ||
        marginBottomTen === null ||
        marginBottomTen === "" ||
        marginBottomTen === "0" ||
        marginBottomTen === 0)
    ) {
      alertRef.current.createAlert(
        "error",
        "You need to enter a margin for one of the games",
        true
      );

      return;
    }

    const data = {
      topEightSelection: topEightSelection,
      bottomTenSelection: bottomTenSelection,
      marginTopEight: marginTopEight,
      marginBottomTen: marginBottomTen,
      round: round,
      user: user.id,
      season: roundFixture[0].year,
    };
    API.postTips(data)
      .then((res) => {
        navigate("/home", {
          state: {
            alert: {
              type: "success",
              message: "Tips Submitted",
              show: true,
            },
          },
        });
      })
      // The quietest failure in the app: pressing Submit and having the
      // request fail did nothing at all - no message, no navigation, nothing
      // on screen changed. Someone would reasonably conclude their tips were
      // in, or press it again. This is the alert the validation messages
      // above already use.
      .catch((err) =>
        alertRef.current.createAlert("error", describeRequestError(err), true)
      );
  }

  function handleChangeTopEight(event) {
    setMarginBottomTen("");
    setMarginTopEight(event.target.value);
  }
  function handleChangeBottomTen(event) {
    setMarginTopEight("");
    setMarginBottomTen(event.target.value);
  }

  function handleSelectionChange(event) {
    if (event.target.value < 9) {
      setTopEightSelection(event.target.name);
    } else {
      setBottomTenSelection(event.target.name);
    }
  }

  // checks if teams selected are playing each other
  useEffect(() => {
    if (roundFixture) {
      roundFixture.forEach((game) => {
        if (
          (topEightSelection === game.hteam &&
            bottomTenSelection === game.ateam) ||
          (bottomTenSelection === game.hteam &&
            topEightSelection === game.ateam)
        ) {
          setTopEightSelection(null);
          setBottomTenSelection(null);
        }
      });
      setIsLoading(false);
    }
  }, [topEightSelection, bottomTenSelection, roundFixture]);

  //   on round state updating retrieve fixtures within that round and squiggle model api results
  // ned to add something in here so that it updates from squiggle checking results
  useEffect(() => {
    // Round 0 is a real round, so check for null rather than truthiness.
    if (round === undefined || round === null) return;

    // Which round this batch belongs to.
    //
    // Stepping through rounds with the arrows starts a new batch before the
    // last has landed, and responses do not have to come back in the order
    // they were asked for. Without this, an earlier round's fixtures arriving
    // late overwrite a later round's - the page settles showing games that
    // belong to neither the label above them nor the last thing clicked.
    const batch = ++roundRequest.current;
    const current = () => roundRequest.current === batch;

    setUpdatingRound(true);
    setLoadError(null);

    const fixtures = API.getRoundDetails(round)
      .then((results) => {
        if (!current()) return;
        setRoundFixture(results.data);
        // The other half of the fix below: a round that loads after a failed
        // one has to clear the state the failure left behind.
        setIsLoading(false);
      })
      .catch((err) => {
        if (!current()) return;
        // The failure that used to hang the page.
        //
        // isLoading was only ever cleared in the effect that reacts to
        // roundFixture arriving - so when the request failed, roundFixture
        // stayed undefined, that effect never ran, and the page sat on its
        // loading state for as long as the tab was open. Silently: the catch
        // logged to the console and returned.
        //
        // Clearing it here is what lets the page render at all, and loadError
        // is what it renders instead of pretending the round is empty.
        setLoadError(describeRequestError(err));
        setIsLoading(false);
      });

    // Alongside the fixtures rather than after them. This used to be chained
    // inside the .then above, waiting on a response it takes nothing from: it
    // needs the round number, which we already have. That was a whole round
    // trip spent queueing, on every round change.
    //
    // Predictions stay a nice-to-have: a finals round Squiggle has no tips for
    // should still render the fixtures.
    const models = API.getModels(round)
      .then((modelResults) => current() && setModelResults(modelResults.data.tips))
      .catch(() => current() && setModelResults(undefined));

    // Odds are the same kind of nice-to-have, and asked for separately so they
    // are: a round nobody has priced, or an odds table that fails to load,
    // must not take the fixtures down with it. Chaining this onto the call
    // above would have made a decorative feature a dependency of the page.
    const prices = API.getOdds(round)
      .then((results) => current() && setOdds(results.data.games))
      .catch(() => current() && setOdds(undefined));

    // All three, so nothing pops in after the content has been handed back.
    // allSettled rather than all: a round Squiggle has no tips for must still
    // let the fixtures through.
    Promise.allSettled([fixtures, models, prices]).then(() => {
      if (current()) setUpdatingRound(false);
    });
  }, [round, retry]);

  // Whether any game in the round being shown has started and not finished.
  //
  // Read off the fixtures already on screen rather than asked for: a game that
  // has bounced has a date in the past, and one that has finished reports
  // complete 100.
  const gameInProgress =
    Array.isArray(roundFixture) &&
    roundFixture.some(
      (game) =>
        game.date &&
        new Date(game.date) <= new Date() &&
        Number(game.complete) !== 100
    );

  // While a game is on, ask again every minute.
  //
  // The server refreshes the scores it holds when a request arrives during a
  // game (services/liveScores.js), but nothing was asking: the page fetches
  // once when it opens and then sits there. Someone watching a final had a
  // score that only moved when they reloaded by hand.
  //
  // Quietly - no fade, no skeleton. This is not a change anyone asked for, so
  // it should look like the numbers updating rather than the page reloading.
  // Only the fixtures are re-fetched; the odds and the predictions do not move
  // during a game.
  useEffect(() => {
    if (!gameInProgress || round === undefined || round === null) return;

    let stop = false;

    const tick = () => {
      // Nothing to update if the tab is not on screen, and polling in the
      // background is how a page quietly costs someone their battery.
      if (document.hidden || stop) return;

      API.getRoundDetails(round)
        .then((results) => !stop && setRoundFixture(results.data))
        // Deliberately silent. A failed background refresh means the score is
        // a minute older than it might have been, which is not worth putting
        // an error in front of someone watching a game.
        .catch(() => {});
    };

    const timer = setInterval(tick, 60000);
    // Also the moment the tab comes back, so returning to it does not mean
    // waiting up to a minute for a score that is already available.
    document.addEventListener("visibilitychange", tick);

    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [gameInProgress, round]);

  // Round and lockout come from the server's season state.
  useEffect(() => {
    if (!seasonState) return;
    setCurrentRound(seasonState.currentRound);
    setLockout(seasonState.lockout);

    // Which round to open on, in utils/rounds where it can be tested. It now
    // has five cases and two of them are only reachable in September.
    //
    // Set on every season state rather than only the first, which is
    // deliberate: the one thing that refreshes it is the countdown reaching
    // zero at the bounce (see RoundStatus). Moving to the round that has just
    // started is exactly right at that moment - the form on screen has stopped
    // being one the server will accept.
    setRound(defaultTipsRound(seasonState));
  }, [seasonState]);

  useEffect(() => {
    if (currentRound) {
      previousRoundTipsFunction({ user: user.id, round: currentRound - 1 });
      currentRoundTipsFunction({ user: user.id, round: currentRound });
    }
  }, [currentRound, user.id]);

  // gets previous rounds tips so that disables checkbox
  function previousRoundTipsFunction(data) {
    API.getPreviousRoundTips(data).then((results) => {
      if (results.data) {
        // console.log(results.data);
        setLastRoundSelectionT8(results.data.topEightSelection);
        setLastRoundSelectionB10(results.data.bottomTenSelection);
      }
    });
  }

  // gets current rounds tips so that shows in checkbox
  async function currentRoundTipsFunction(round) {
    await API.getCurrentRoundTips(round).then((results) => {
      // console.log(results.data);
      if (results.data) {
        setTopEightSelection(results.data.topEightSelection);
        setBottomTenSelection(results.data.bottomTenSelection);
        setMarginTopEight(results.data.marginTopEight);
        setMarginBottomTen(results.data.marginBottomTen);
      }
    });
  }

  // The round and lockout came from comparing fixture dates here, with a three
  // hour allowance for match duration. GET /api/season reports both directly
  // now, and unlike this code it understands finals - see services/season.js.

  // This page also downloaded the round from Squiggle and posted it into the
  // fixtures collection whenever it loaded during a lockout, which let any
  // signed-in visitor rewrite match scores. Nothing here read the response -
  // the fixtures shown come from the database - so it only ever existed to
  // perform that write. The scheduled sync does it now; see
  // services/seasonSync.js.


  // Rounds that can be tipped - see utils/rounds. Tipping is closed by the
  // time this could reach a finals round, but the two pages agreeing on what
  // a round list means is worth more than relying on that.
  const roundOptions = twinTipsRounds(seasonState);

  // Names come from the season state, so the picker says "Wildcard Finals"
  // rather than "Round 25" - and says it correctly in a season that numbers
  // the finals differently.
  const labelRound = roundLabeller(seasonState && seasonState.roundNames);

  // Every round the season has, finals included - used when the page is a
  // results view rather than a tipping form.
  const allRounds = seasonState && seasonState.rounds ? seasonState.rounds : [];

  // What can actually be picked this round, by the same rules FixtureCard
  // draws the checkboxes with: a team belongs to the Top 8 or the Bottom 10 by
  // its ladder rank, and a team tipped last round is disabled.
  //
  // A round with nothing in one of the two groups cannot be tipped at all -
  // the client will not submit and the server would refuse it. Without this
  // the page just presents a form that can never be completed, with no green
  // checkbox anywhere and nothing saying why.
  //
  // Byes alone do not cause it: with 18 teams the AFL schedules at most six in
  // a round, so at least two of the top eight always play. A missing ladder
  // does - every team then has no rank, and the Top 8 becomes unfindable. The
  // fixture list is the AFL's to change, so this checks rather than assumes.
  const selectable = () => {
    const top = [];
    const bottom = [];
    let unranked = 0;

    (roundFixture || []).forEach((game) => {
      const homeRank = ((game["home-team-standing"] || [])[0] || {}).rank;
      const awayRank = ((game["away-team-standing"] || [])[0] || {}).rank;

      [
        [game.hteam, homeRank],
        [game.ateam, awayRank],
      ].forEach(([team, rank]) => {
        // Finals fixtures carry empty team names until the sides are known.
        if (!team) return;

        if (rank === null || rank === undefined) {
          unranked += 1;
          return;
        }

        // Already used last round, so its checkbox is disabled.
        if (team === lastRoundSelectionT8 || team === lastRoundSelectionB10) {
          return;
        }

        if (rank <= 8) top.push(team);
        else bottom.push(team);
      });
    });

    return { top, bottom, unranked };
  };

  // Populated arrays can be empty: a finals fixture whose teams are not yet
  // decided has a null team id, and a round with no ladder snapshot has no
  // standings. Every one of these used to be read as [0]["field"], which
  // throws on an empty array.
  const renderFixture = (game) => {
    const home = (game["home-team"] || [])[0] || {};
    const away = (game["away-team"] || [])[0] || {};
    const homeStanding = (game["home-team-standing"] || [])[0] || {};
    const awayStanding = (game["away-team-standing"] || [])[0] || {};

    return (
      <FixtureCard
        id={game.id}
        modelResults={modelResults}
        odds={odds ? odds[game.id] : undefined}
        venue={game.venue}
        hteam={game.hteam}
        ateam={game.ateam}
        complete={game.complete}
        hscore={game.hscore}
        ascore={game.ascore}
        winner={game.winner === game.hteam ? home.abbrev : away.abbrev}
        date={game.date}
        round={game.round}
        hteamlogo={home.logo}
        ateamlogo={away.logo}
        hteamrank={homeStanding.rank}
        ateamrank={awayStanding.rank}
        aabrev={away.abbrev}
        habrev={home.abbrev}
        key={game.id}
        handleSelectionChange={handleSelectionChange}
        topEightSelection={topEightSelection}
        bottomTenSelection={bottomTenSelection}
        currentRound={currentRound}
        lockout={lockout}
        lastRoundSelectionT8={lastRoundSelectionT8}
        lastRoundSelectionB10={lastRoundSelectionB10}
      />
    );
  };

  // The round's games under a heading per day, rather than every card
  // repeating a date its neighbours already gave - a four-game Saturday wrote
  // "Saturday September 5th" four times over.
  //
  // Keyed on the day as the reader's own browser renders it. dayKey builds that
  // from the local parts rather than from the ISO string, so grouping cannot
  // split a Saturday night game away from the Saturday it belongs to.
  //
  // A Map rather than a walk comparing each game to the one before it. The API
  // returns a round sorted by date, so consecutive grouping would do - but a
  // Map cannot produce the same day twice however the games arrive, and it
  // still keeps them in the order they came.
  const renderFixtureDays = () => {
    const days = new Map();

    for (const game of roundFixture) {
      const key = dayKey(game.date);
      if (!days.has(key)) days.set(key, { key, date: game.date, games: [] });
      days.get(key).games.push(game);
    }

    return [...days.values()].map((day) => (
      <div key={day.key}>
        {/* h3: the page's h1 names whose tips these are, the panel above
            carries the h2, so this is the level below them. */}
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}
        >
          {/* A finals fixture can exist with no date at all, so there is not
              always a day to name. */}
          {day.date
            ? dayAndDate(day.date)
            : "Date to be confirmed"}
        </Typography>
        {day.games.map(renderFixture)}
      </div>
    ));
  };

  // Only worth checking on the round actually being tipped. Looking back at a
  // completed round legitimately has nothing to select.
  const tippingThisRound = round === currentRound && !lockout;
  const { top, bottom, unranked } = selectable();
  const cannotTip =
    tippingThisRound &&
    roundFixture &&
    roundFixture.length > 0 &&
    (top.length === 0 || bottom.length === 0);

  // Which of the two is missing, and why, so the message says something the
  // reader can act on rather than just refusing.
  const missing =
    top.length === 0 && bottom.length === 0
      ? "Top 8 or Bottom 10"
      : top.length === 0
      ? "Top 8"
      : "Bottom 10";

  const reason = unranked
    ? "The ladder for this round hasn't loaded, so teams can't be sorted into the Top 8 and the Bottom 10."
    : `No ${missing} team is playing a game you're allowed to pick this round.`;

  return (
    <div>
      {isLoading ? (
        <PageSkeleton maxWidth="md">
          <Panel>
            <PickerSkeleton />
            <FixtureDaysSkeleton days={[4, 3]} />
          </Panel>
        </PageSkeleton>
      ) : seasonState && !seasonState.tippingOpen ? (
        // Without this the page rendered empty whenever tipping was closed:
        // the fixtures it wanted did not exist, or the round was a final with
        // no bottom 10 to pick from. Say so instead of showing nothing.
        <Container maxWidth="md">
          {/* The name was the page telling you who you are, on a page you
              reached by signing in. It said nothing the nav bar had not
              already said by marking "Tip now" as the page you are on.

              Kept as the document's heading rather than deleted outright: it
              is the only h1 here, and without one the day headings below sit
              under nothing and this becomes the one page in the app with no
              heading at all. Named for the nav item that leads here, so the
              link and the page agree. */}
          <Typography variant="h5" component="h1" sx={visuallyHidden}>
            Tip now
          </Typography>
          <Box
            sx={{
              boxShadow: 3,
              mb: 2,
              p: 2,
              bgcolor: "background.paper"
            }}>
            <Typography variant="h6" component="h2" gutterBottom>
              {/* Once the home-and-away rounds are done this stops naming the
                  AFL round. It read "2026 - Finals Week 1" directly above a
                  paragraph saying the season had finished. */}
              {!namesRound(seasonState)
                ? seasonOverLabel(seasonState.season)
                : seasonState.roundName
                ? `${seasonState.season} - ${seasonState.roundName}`
                : `${seasonState.season} season`}
            </Typography>
            <p>{seasonState.message}</p>
            <p>
              You can still see where everyone finished on the{" "}
              <Link to="/leaderboard">leaderboard</Link>.
            </p>
          </Box>

          {/* Results stay browsable once tipping closes - otherwise the whole
              season's scores become unreachable the moment the last round is
              played. Opens on the last round that actually has scores, not the
              current round, whose games may not have been played yet. */}
          <Box
            sx={{
              boxShadow: 3,
              mb: 2,
              p: 2,
              bgcolor: "background.paper"
            }}>
            {/* "Round", like the other two pickers in the app. The label
                names what the control chooses, and this one chooses a round -
                "Results" was naming the mode the page happened to be in,
                which the reader can already see from the table under it.

                It is also the combobox's accessible name, so a screen reader
                was announcing the page's state where the control's purpose
                should be. The id keeps its name: it only has to be unique on
                the page, and the two pickers are never shown together. */}
            <RoundPicker
              id="select-results-round"
              label="Round"
              value={round}
              options={allRounds}
              getOptionLabel={labelRound}
              onChange={setRound}
            />
            {/* Faded, not cleared, while the next round is on its way. The
                picker updates the instant it is clicked; without this the
                games below it stayed as they were, so the page showed one
                round's fixtures under another round's name and gave no sign
                it was working. */}
            <Updating busy={updatingRound}>
              <FormGroup>
                {loadError ? (
                  <LoadFailure message={loadError} onRetry={retryRound} />
                ) : roundFixture && roundFixture.length ? (
                  renderFixtureDays()
                ) : (
                  <p>No games for that round.</p>
                )}
              </FormGroup>
            </Updating>
          </Box>
        </Container>
      ) : (
        <Container maxWidth="md">
          {/* The name was the page telling you who you are, on a page you
              reached by signing in. It said nothing the nav bar had not
              already said by marking "Tip now" as the page you are on.

              Kept as the document's heading rather than deleted outright: it
              is the only h1 here, and without one the day headings below sit
              under nothing and this becomes the one page in the app with no
              heading at all. Named for the nav item that leads here, so the
              link and the page agree. */}
          <Typography variant="h5" component="h1" sx={visuallyHidden}>
            Tip now
          </Typography>
          <RoundStatus />
          {/* The three rules the form actually enforces. The last one used to
              go unsaid: a team tipped last round has its checkbox disabled,
              which without this reads as the page being broken rather than as
              a rule. */}
          <p>
            Pick one team from the Top 8 (green) and one from the Bottom 10
            (red). Add a margin to one of them, not both. You can&apos;t pick
            the same team you picked last round.
          </p>
          {/* Above the fixtures rather than beside the submit button, so it is
              read before scrolling through games that cannot make a valid
              tip. */}
          {cannotTip ? (
            <MuiAlert severity="warning" sx={{ mb: 2 }}>
              A tip can&apos;t be entered for this round. {reason} Nothing you
              do here will save, so this one is on the competition rather than
              on you - worth letting the group know.
            </MuiAlert>
          ) : null}
          {/* The top 8 and the bottom 10 are the rule of this competition, and
              when the ladder behind them is older than it should be, saying so
              is the difference between a puzzling refusal and an explained one.
              Without this the page rejects a team that is plainly eighth and
              gives no reason anyone could act on. */}
          {seasonState && seasonState.ladderStale ? (
            <MuiAlert severity="info" sx={{ mb: 2 }}>
              These groups are set from the ladder after round{" "}
              {seasonState.ladderRound}, not round {currentRound - 1} - that
              round has a game still unplayed, so its ladder hasn&apos;t been
              taken yet. A team that has moved since may be in the other group
              here.
            </MuiAlert>
          ) : null}
          {/* The right round's ladder, but taken before that round finished.
              A postponed game no longer holds the whole competition up - the
              snapshot is captured anyway and marked - and the split it produces
              can still move when the game is eventually played. Different
              remedy from the message above, so it gets its own line: that one
              is waiting on a snapshot, this one is waiting on a match. Shown
              only when the stale warning is not, because two boxes both saying
              the top 8 might move is noise rather than twice the warning. */}
          {seasonState &&
          seasonState.ladderProvisional &&
          !seasonState.ladderStale ? (
            <MuiAlert severity="info" sx={{ mb: 2 }}>
              Round {seasonState.ladderRound} has a game that was never played,
              so these groups come from the ladder as it stands without it. If
              that game goes ahead the split may change, and a team in one group
              here could end up in the other.
            </MuiAlert>
          ) : null}
          <Box
            sx={{
              boxShadow: 3,
              mb: 2,
              p: 2,
              bgcolor: "background.paper"
            }}>
            <Grid container direction="row">
              <Grid size={6}>
                {/* roundOptions is generated from the season state rather
                    than a fixed list of 23, which could not represent an
                    Opening Round or a season that ran longer. */}
                <RoundPicker
                  id="select-round"
                  label="Round"
                  value={round}
                  options={roundOptions}
                  getOptionLabel={labelRound}
                  onChange={setRound}
                />
              </Grid>
              <Grid size={6}>
                <a
                  href="https://squiggle.com.au/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginLeft: "0px" }}
                  align="right"
                >
                  {" "}
                  <Typography variant="subtitle1">Predictions By:</Typography>
                  <img
                    src="/assets/squiggle-logo.png"
                    alt="Squiggle logo"
                    width="100"
                    height="auto"
                    align="right"
                  ></img>
                </a>
              </Grid>
            </Grid>
            <Updating busy={updatingRound}>
              <FormGroup>
                {loadError ? (
                  <LoadFailure message={loadError} onRetry={retryRound} />
                ) : roundFixture ? (
                  renderFixtureDays()
                ) : (
                  <FixtureCard data="No games" />
                )}
              </FormGroup>
            </Updating>
          </Box>
          <Alert ref={alertRef} />
          {round === currentRound && !lockout ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <Grid container direction="row">
                <Grid size={6} align="right" style={{ padding: "10px" }}>
                  <Typography variant="subtitle1" gutterBottom>
                    {!topEightSelection
                      ? "Select a Top 8 Team"
                      : "Top 8 tip: " + topEightSelection}{" "}
                  </Typography>
                </Grid>
                <Grid size={6}>
                  <TextField
                    id="top8input"
                    label="Margin"
                    variant="outlined"
                    type="number"
                    value={marginTopEight || ""}
                    onChange={handleChangeTopEight}
                    inputProps={{
                      min: 0,
                      max: 200,
                      style: { textAlign: "center" },
                    }}
                    style={{ width: 80 }}
                  />
                </Grid>
                <Grid size={6} align="right" style={{ padding: "10px" }}>
                  <Typography variant="subtitle1" gutterBottom>
                    {!bottomTenSelection
                      ? "Select a Bottom 10 Team"
                      : "Bottom 10 tip: " + bottomTenSelection}{" "}
                  </Typography>
                </Grid>
                <Grid size={6}>
                  <TextField
                    id="bottom10input"
                    label="Margin"
                    variant="outlined"
                    type="number"
                    value={marginBottomTen || ""}
                    onChange={handleChangeBottomTen}
                    inputProps={{
                      min: 0,
                      max: 200,
                      style: { textAlign: "center" },
                    }}
                    style={{ width: 80 }}
                  />
                </Grid>
              </Grid>

              <Button variant="contained" color="primary" onClick={submitTips}>
                Submit tips
              </Button>
            </div>
          ) : (
            ""
          )}
        </Container>
      )}
    </div>
  );
};

export default TipsPage;

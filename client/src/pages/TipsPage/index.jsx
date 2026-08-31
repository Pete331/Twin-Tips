import { useEffect, useState, useContext, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import { namesRound, seasonOverLabel } from "../../utils/seasonLabel";
import { useNavigate, Link } from "react-router-dom";
import FixtureCard from "../../components/FixtureCard";
import RoundStatus from "../../components/RoundStatus";
import Loader from "../../components/Loader";
import API from "../../utils/TipsAPI";
import Container from "@mui/material/Container";
import MuiAlert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import { MENU_BELOW } from "../../utils/selectMenu";
import FormGroup from "@mui/material/FormGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Alert from "../../components/Alerts";
import Box from "@mui/material/Box";

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
        navigate("/dashboard", {
          state: {
            alert: {
              type: "success",
              message: "Tips Submitted",
              show: true,
            },
          },
        });
      })
      .catch((err) => console.log(err));
  }

  function handleChange(event) {
    setRound(event.target.value);
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
      loadingTimeout();
    }
  }, [topEightSelection, bottomTenSelection, roundFixture]);

  //   on round state updating retrieve fixtures within that round and squiggle model api results
  // ned to add something in here so that it updates from squiggle checking results
  useEffect(() => {
    // Round 0 is a real round, so check for null rather than truthiness.
    if (round === undefined || round === null) return;

    API.getRoundDetails(round)
      .then((results) => {
        setRoundFixture(results.data);
        // Model predictions are a nice-to-have: a finals round Squiggle has no
        // tips for should still render the fixtures.
        return API.getModels(round)
          .then((modelResults) => setModelResults(modelResults.data.tips))
          .catch(() => setModelResults(undefined));
      })
      .catch((err) => console.log(err));
  }, [round]);

  // Round and lockout come from the server's season state.
  useEffect(() => {
    if (!seasonState) return;
    setCurrentRound(seasonState.currentRound);
    setLockout(seasonState.lockout);

    // When tipping is closed the page is a results view, so open on the last
    // round that has actually been played. Opening on the current round would
    // show an unplayed round reading 0-0 in every game.
    if (seasonState.tippingOpen) {
      setRound(seasonState.currentRound);
    } else {
      setRound(
        seasonState.lastCompletedRound !== null &&
          seasonState.lastCompletedRound !== undefined
          ? seasonState.lastCompletedRound
          : seasonState.currentRound
      );
    }
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

  // Selectable rounds, from the season's first (0 where there is an Opening
  // Round) to the current one.
  const roundOptions = [];
  if (seasonState && seasonState.currentRound !== null) {
    const from = seasonState.firstRound !== null ? seasonState.firstRound : 1;
    for (let r = from; r <= seasonState.currentRound; r += 1) {
      roundOptions.push(r);
    }
  }

  // Every round the season has, finals included - used when the page is a
  // results view rather than a tipping form.
  const allRounds = seasonState && seasonState.rounds ? seasonState.rounds : [];

  const roundLabel = (r) => (r === 0 ? "Opening Round" : `Round ${r}`);

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
        <Loader />
      ) : seasonState && !seasonState.tippingOpen ? (
        // Without this the page rendered empty whenever tipping was closed:
        // the fixtures it wanted did not exist, or the round was a final with
        // no bottom 10 to pick from. Say so instead of showing nothing.
        <Container maxWidth="md">
          <Typography variant="h5" component="h1" gutterBottom>
            {user.name}'s Tips
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
            <FormControl sx={{ m: 1, minWidth: 120 }}>
              <InputLabel id="select-results-round">Results</InputLabel>
              <Select
                MenuProps={MENU_BELOW}
                labelId="select-results-round"
                label="Results"
                value={round === undefined || round === null ? "" : round}
                onChange={handleChange}
              >
                {allRounds.map((r) => (
                  <MenuItem key={r} value={r}>
                    {roundLabel(r)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormGroup>
              {roundFixture && roundFixture.length ? (
                roundFixture.map(renderFixture)
              ) : (
                <p>No games for that round.</p>
              )}
            </FormGroup>
          </Box>
        </Container>
      ) : (
        <Container maxWidth="md">
          <Typography variant="h5" component="h1" gutterBottom>
            {user.name}'s Tips
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
          <Box
            sx={{
              boxShadow: 3,
              mb: 2,
              p: 2,
              bgcolor: "background.paper"
            }}>
            <Grid container direction="row">
              <Grid size={6}>
                <FormControl sx={{ m: 1, minWidth: 120 }}>
                  <InputLabel id="select-round">Round</InputLabel>
                  <Select
                    MenuProps={MENU_BELOW}
                    labelId="select-round"
                    label="Round"
                    // Round 0 is falsy, so check for null explicitly.
                    value={round === undefined || round === null ? "" : round}
                    onChange={handleChange}
                  >
                    {/* Generated from the season state rather than a fixed
                        list of 23, which could not represent an Opening
                        Round or a season with more rounds. */}
                    {roundOptions.map((r) => (
                      <MenuItem key={r} value={r}>
                        {r === 0 ? "Opening Round" : `Round ${r}`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
            <FormGroup>
              {roundFixture ? (
                roundFixture.map(renderFixture)
              ) : (
                <FixtureCard data="No games" />
              )}
            </FormGroup>
          </Box>
          <Alert ref={alertRef} />
          {round === currentRound && !lockout ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <Grid container direction="row">
                <Grid size={6} align="right" style={{ padding: "10px" }}>
                  <Typography variant="subtitle1" gutterBottom>
                    {!topEightSelection
                      ? "Select a Top 8 Team"
                      : "Top 8 Tip: " + topEightSelection}{" "}
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
                      : "Bottom 10 Tip: " + bottomTenSelection}{" "}
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
                Submit Tips
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

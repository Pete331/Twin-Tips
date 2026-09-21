import FixtureCenterCard from "../FixtureCenterCard";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Box from "@mui/material/Box";
import CheckIcon from "@mui/icons-material/Check";
import { GREEN, RED } from "../../utils/resultTint";

const FixtureCard = ({
  id,
  modelResults,
  odds,
  venue,
  hteam,
  ateam,
  complete,
  hscore,
  ascore,
  winner,
  timestr,
  date,
  aabrev,
  habrev,
  hteamrank,
  ateamrank,
  handleSelectionChange,
  topEightSelection,
  bottomTenSelection,
  tippedTopEight,
  tippedBottomTen,
  tippedMarginTopEight,
  tippedMarginBottomTen,
  currentRound,
  round,
  lockout,
  lastRoundSelectionT8,
  lastRoundSelectionB10,
}) => {
  // Returns "" where there is no rank to state, rather than a place.
  //
  // Every comparison against undefined is false and NaN % 10 is NaN, so the
  // chain below fell through to indexing the suffix array with NaN - which is
  // undefined, and undefined + undefined is the string "NaN". A finals card
  // for a side not yet decided printed "NaN" where the ladder position goes.
  //
  // Not only the undecided sides either: services/standings.js notes that
  // Squiggle stops reporting a rank once the finals begin, so a named team in
  // a finals round has no rank to show and reached the same path.
  const getOrdinalNum = (number) => {
    if (!Number.isFinite(number) || number <= 0) return "";

    let selector;

    if ((number > 3 && number < 21) || number % 10 > 3) {
      selector = 0;
    } else {
      selector = number % 10;
    }

    return number + ["th", "st", "nd", "rd", ""][selector];
  };

  const homeOrdinal = getOrdinalNum(hteamrank);
  const awayOrdinal = getOrdinalNum(ateamrank);

  // Logo files are named after Squiggle's team abbreviation, which is a display
  // string they can change - it went from GC to GCS for Gold Coast, and the
  // logo silently broke. A new club would have no file at all. Hide the image
  // rather than leaving a broken-image icon; the team name is alongside it.
  const hideBrokenLogo = (event) => {
    event.target.style.display = "none";
  };

  // The logo's box, on both sides of the card.
  //
  // maxWidth alone was a fixed 80px, and a fixed width is not a maximum: a
  // team's card is a quarter of the fixture row, which at 375px is 75px wide,
  // so every logo in the round drew five pixels wider than the card holding it
  // and overhung the edge by seven. All eighteen of them, every round, on the
  // width most people read this page at.
  //
  // It has been that way as long as the cards have. Nobody saw it because the
  // marks it used to draw were narrow ones with space around them: the box
  // overflowed, the ink inside it did not. The club lockups that replaced them
  // carry a wordmark out to both edges of a square canvas, so the same
  // overflow now clips visible letters.
  //
  // width: 100% is what makes maxWidth behave like one - fill the card, up to
  // 80px, and no further.
  const logoStyle = { width: "100%", maxWidth: "80px", height: "auto" };

  // Finals fixtures exist before anyone knows who is in them: the semi-finals,
  // preliminary finals and grand final all carry empty team names and a null
  // team id. Render the fixture without pretending there is a team.
  const homeUndecided = !hteam;
  const awayUndecided = !ateam;
  const homeName = hteam || "To be decided";
  const awayName = ateam || "To be decided";

  // Which half of the ladder a side is in, which is the thing being tipped on.
  //
  // The same tints the round results and the pool balances use, from
  // utils/resultTint - so green means one thing across the site rather than
  // three shades of it across three screens. Here it is a category rather than
  // a verdict: a side in the bottom ten has not done anything wrong, it is just
  // the half you pick your bottom-ten tip from.
  //
  // A rank of undefined - a finals fixture whose teams are not decided yet -
  // fails both comparisons and takes no colour, which is what it should do.
  const ladderTint = (rank) =>
    round !== currentRound ? undefined : rank <= 8 ? GREEN : rank > 8 ? RED : undefined;

  const hcolor = ladderTint(hteamrank);
  const acolor = ladderTint(ateamrank);

  // A game being played right now, as opposed to one not started or finished.
  //
  // This is the only state where the clock is worth the room it takes. Before a
  // bounce there is nothing to say and the ground and start time are the two
  // things somebody actually wants; afterwards Squiggle sends "Full Time",
  // which the final score beneath it already says louder.
  const inProgress = Number(complete) > 0 && Number(complete) < 100;

  // A side already used last round cannot be picked again. Read once here
  // rather than twice per checkbox, because the same answer decides both
  // whether the control is disabled and what it says about itself.
  const homeUsedLastRound =
    lastRoundSelectionT8 === hteam || lastRoundSelectionB10 === hteam;
  const awayUsedLastRound =
    lastRoundSelectionT8 === ateam || lastRoundSelectionB10 === ateam;

  // What a screen reader hears on reaching one of these checkboxes.
  //
  // FormControlLabel is given a control and no label, because the team name is
  // already on the card as loose text beside the control rather than inside it.
  // That left the label element empty, so every checkbox announced as "checkbox,
  // unchecked" and nothing said which side it belonged to - two identical
  // controls per fixture, nine fixtures a round, and no way to tell them apart
  // without sight of the card.
  //
  // The group is named as well as the team. Which half of the ladder a side is
  // in is the rule being tipped on, and the only other thing saying it is the
  // tint behind the card - colour on its own is not a channel everyone has.
  //
  // A side used last round says that instead. A disabled control announces as
  // unavailable and gives no reason, and here the reason is the whole rule.
  const tipLabel = (team, rank, usedLastRound) => {
    if (usedLastRound) return `${team}, already tipped last round`;

    const group = rank <= 8 ? "top eight" : rank > 8 ? "bottom ten" : null;
    return group ? `Tip ${team}, ${group}` : `Tip ${team}`;
  };

  // Whether the checkboxes are on this card at all. Only the round being tipped,
  // and only until it bounces - every other round is a record rather than a form.
  const tippable = round === currentRound && !lockout;

  // Which side won, read off the scores rather than the winner prop.
  //
  // The prop is `game.winner === game.hteam ? home.abbrev : away.abbrev`, which
  // names the away side whenever winner is empty - and it is empty for a draw
  // and for every game not yet played. The centre panel already sidesteps that
  // by comparing scores, and this agrees with it rather than with the prop.
  //
  // Nothing is marked until the final siren: complete counts up through the
  // game, so a side ahead at three-quarter time is leading, not winning. A draw
  // has no winner to mark and takes neither.
  const finished = Number(complete) === 100;
  const homeWon = finished && hscore > ascore;
  const awayWon = finished && ascore > hscore;

  // The side you picked, for the rounds where the checkbox is gone.
  //
  // Before lockout the checkbox says this, and better, because it is also the
  // control. Afterwards the page dropped the fact entirely: your own tips left
  // the screen at the first bounce and the only way back to them was the
  // leaderboard's round view.
  //
  // Which group the pick came from does not matter here. A side is the home
  // side or the away side by the draw, and it is a top-eight or bottom-ten pick
  // by where it sits on the ladder, and those are unrelated - so both are
  // checked against both. Testing only tippedTopEight against the home side
  // works for as long as every home side happens to be in the top eight.
  //
  // No test against tippable, deliberately. The markup below reaches this only
  // on the branch where the checkbox is absent, so repeating the condition here
  // would be a second guard that cannot fire and cannot be tested - the kind
  // that reads as protection and provides none.
  const homeTipped = tippedTopEight === hteam || tippedBottomTen === hteam;
  const awayTipped = tippedTopEight === ateam || tippedBottomTen === ateam;

  // The margin, and which of the two picks is carrying it.
  //
  // One margin a round, not one a pick: the tips page clears either field when
  // the other is typed into, and POST /api/tips refuses a tip holding both. So
  // exactly one of your two cards has a number on it, and which one is itself
  // worth seeing - it is the game your tiebreak is riding on.
  //
  // Decided by the same rule scoring uses, in services/results.js: the margin
  // is on the top-eight pick when that field is above zero, otherwise on the
  // bottom-ten one. Zero is how the page says "not this one", which is why it
  // is a comparison rather than a presence check. Older tips in the collection
  // do carry both, from before the server enforced it, and this agrees with
  // scoring about which of them counts instead of drawing two.
  const marginOnTopEight = Number(tippedMarginTopEight) > 0;
  const marginTeam = marginOnTopEight ? tippedTopEight : tippedBottomTen;
  const marginValue = marginOnTopEight
    ? Number(tippedMarginTopEight)
    : Number(tippedMarginBottomTen);
  const shownMargin = marginValue > 0 ? marginValue : null;

  // Deliberately not the difference that scoring stores alongside it.
  //
  // topEightDifference is `won ? |margin - predicted| : margin + predicted`, so
  // on a pick that lost it adds the prediction to the real margin rather than
  // subtracting it. That is a tiebreak penalty, not a measure of how close the
  // guess was, and showing it here as "out by 32" would be false on exactly the
  // tips somebody most wants to go back over. The real margin is already on the
  // card - "ADE by 56" - next to the number you named, so the comparison is
  // there to be made without this page doing arithmetic it would get wrong.

  // A tick, and the word for it.
  //
  // The tick alone would be the same mark the checkbox uses two lines up, on
  // the same card, in the same place - so on a finished game it would read as
  // "this one won" to anybody who had not been told otherwise. Those are the
  // two facts this page exists to keep apart. The words are what separate them,
  // and they are also what a screen reader gets, since a bare icon says nothing
  // and a colour says nothing to half the people looking at it.
  // Takes the side it is being drawn on, so only the card carrying the margin
  // states it. Stacked rather than run together on one line: a team's card is
  // 75px wide on a phone, and "Margin 24" on its own line is what a screen
  // reader can read as a sentence rather than as a number trailing a label.
  const yourTip = (team) => (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        color: "primary.main",
        fontSize: "0.8125rem",
        lineHeight: 1.3,
      }}
    >
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          fontWeight: 600,
        }}
      >
        {/* MUI's SvgIcon already sets aria-hidden when it is given no
            titleAccess, so this restates a default rather than adding one. Kept
            because the default belongs to a library and the requirement does
            not: the words beside the icon are the label, and the icon being
            announced separately would have a screen reader read a tick it
            cannot describe. */}
        <CheckIcon fontSize="inherit" aria-hidden="true" />
        Your tip
      </Box>
      {shownMargin !== null && marginTeam === team ? (
        <Box component="span" sx={{ fontWeight: 400 }}>
          Margin {shownMargin}
        </Box>
      ) : null}
    </Box>
  );

  return (
    <div style={{ padding: "3px", height: "100%", width: "100%" }}>
      {/* This was gated on hteam, so a fixture whose teams are not yet decided
          rendered an empty div - the finals disappeared from the calendar
          rather than showing as upcoming. The card handles undecided sides
          now, so it only needs a fixture to exist. */}
      {id ? (
        <Grid
          container
          direction="row"
          // textAlign in sx, not align. Grid has no align prop, so it went
          // through to the div as the HTML 4 presentational attribute, which
          // browsers still honour - which is why nobody noticed. One of these
          // renders per fixture, so a round put seven of them in the page.
          sx={{
            textAlign: "center",
          alignItems: "stretch"
        }}>
          <Grid size={3}>
            <Card
              variant="outlined"
              sx={{ height: "100%", display: "flex", flexFlow: "column", flexGrow: 1 }}
            >
              <CardContent
                style={{
                  backgroundColor: hcolor,
                  padding: "2px",
                  height: "100%",
                }}
              >
                <Grid>
                  {homeUndecided ? (
                    ""
                  ) : (
                    <img
                      src={`/assets/team-logos/${habrev}.png`}
                      alt={hteam}
                      onError={hideBrokenLogo}
                      style={logoStyle}
                    />
                  )}
                </Grid>
                <Box
                  component="span"
                  // Bold on the winner, and nothing else. It repeats what the
                  // centre panel already says in words - "BRI by 24" - so it
                  // adds no fact and needs no label of its own; it is there so
                  // a round can be read down the column instead of parsing an
                  // abbreviation against a full name nine times.
                  sx={{ fontWeight: homeWon ? 700 : 400 }}
                >
                  {homeName}
                </Box>{" "}
                {"  "}
                {tippable ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        name={hteam}
                        onChange={handleSelectionChange}
                        value={hteamrank}
                        disabled={homeUsedLastRound}
                        slotProps={{
                          input: {
                            "aria-label": tipLabel(
                              homeName,
                              hteamrank,
                              homeUsedLastRound
                            ),
                          },
                        }}
                        checked={
                          topEightSelection === hteam ||
                          bottomTenSelection === hteam
                        }
                      />
                    }
                  />
                ) : homeTipped ? (
                  yourTip(hteam)
                ) : (
                  ""
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={6}>
            <Card variant="outlined" style={{ height: "100%", width: "100%" }}>
              {complete !== 0 ? (
                <FixtureCenterCard
                  aabrev={aabrev}
                  habrev={habrev}
                  venue={venue}
                  currentRound={currentRound}
                  round={round}
                  hsideattribute={hscore}
                  asideattribute={ascore}
                  // Only while it is being played. Passing it at full time
                  // would put "Full Time" where the ground goes, on a card
                  // whose score already says the game is over.
                  timestr={inProgress ? timestr : undefined}
                  winner={
                    /* Level scores are answered first, because every branch
                       below names a side and a level game has no side to name.

                       A game in progress at 2-2 read "*Carlton by 0". The only
                       comparison was whether home was ahead, so level fell
                       through to the away branch and was announced as leading
                       by nothing. Finished and level was already "Draw";
                       in progress and level had no case of its own.

                       They stay two sentences rather than one. A draw is the
                       result; scores level is the state of play, and the star
                       is what says which of the two you are reading. */
                    hscore === ascore
                      ? complete === 100
                        ? "Draw"
                        : "*Scores level"
                      : complete === 100
                      ? `${winner} by ${Math.abs(hscore - ascore)}`
                      : `*${hscore > ascore ? hteam : ateam} by ${Math.abs(
                          hscore - ascore
                        )}`
                  }
                  date={date}
                />
              ) : (
                /* provisional: Squiggle only knows where and when once it
                   knows who - see the note in FixtureCenterCard.

                   Odds go on this branch alone. The other is a game already
                   under way or finished - complete !== 0 - and a price fetched
                   before the bounce sitting beside a live score would read as
                   current when it is not. */
                <FixtureCenterCard
                  aabrev={aabrev}
                  habrev={habrev}
                  hteam={hteam}
                  ateam={ateam}
                  venue={venue}
                  provisional={homeUndecided || awayUndecided}
                  hsideattribute={homeOrdinal.toString()}
                  asideattribute={awayOrdinal.toString()}
                  date={date}
                  currentRound={currentRound}
                  round={round}
                  id={id}
                  modelResults={modelResults}
                  odds={odds}
                />
              )}
            </Card>
          </Grid>

          <Grid size={3}>
            <Card
              variant="outlined"
              sx={{ height: "100%", display: "flex", flexFlow: "column", flexGrow: 1 }}
            >
              <CardContent
                style={{
                  backgroundColor: acolor,
                  padding: "2px",
                  height: "100%",
                }}
              >
                <Grid>
                  {awayUndecided ? (
                    ""
                  ) : (
                    <img
                      src={`/assets/team-logos/${aabrev}.png`}
                      alt={ateam}
                      onError={hideBrokenLogo}
                      style={logoStyle}
                    />
                  )}
                </Grid>
                <Box component="span" sx={{ fontWeight: awayWon ? 700 : 400 }}>
                  {awayName}
                </Box>
                {"  "}
                {tippable ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        name={ateam}
                        onChange={handleSelectionChange}
                        value={ateamrank}
                        disabled={awayUsedLastRound}
                        slotProps={{
                          input: {
                            "aria-label": tipLabel(
                              awayName,
                              ateamrank,
                              awayUsedLastRound
                            ),
                          },
                        }}
                        checked={
                          topEightSelection === ateam ||
                          bottomTenSelection === ateam
                        }
                      />
                    }
                  />
                ) : awayTipped ? (
                  yourTip(ateam)
                ) : (
                  ""
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : (
        ""
      )}
    </div>
  );
};

export default FixtureCard;

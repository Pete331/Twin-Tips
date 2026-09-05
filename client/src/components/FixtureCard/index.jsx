import FixtureCenterCard from "../FixtureCenterCard";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
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

  return (
    <div style={{ padding: "3px", height: "100%", width: "100%" }}>
      {/* This was gated on hteam, so a fixture whose teams are not yet decided
          rendered an empty div - the finals disappeared from the calendar
          rather than showing as upcoming. The card handles undecided sides
          now, so it only needs a fixture to exist. */}
      {id ? (
        <Grid container direction="row" align="center" sx={{
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
                      src={`/assets/team-logos/${habrev}.svg`}
                      alt={hteam}
                      onError={hideBrokenLogo}
                      style={{ maxWidth: "80px", height: "auto" }}
                    />
                  )}
                </Grid>
                {homeName} {"  "}
                {round === currentRound && !lockout ? (
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
                      src={`/assets/team-logos/${aabrev}.svg`}
                      alt={ateam}
                      onError={hideBrokenLogo}
                      style={{ maxWidth: "80px", height: "auto" }}
                    />
                  )}
                </Grid>
                {awayName}
                {"  "}
                {round === currentRound && !lockout ? (
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

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Moment from "moment";

import FixtureOdds from "../FixtureOdds";


// This slot carries a ladder position before a game and a score after it, so
// the emptiness test cannot be plain truthiness: a side that kicked 0 is a
// real score and has to stay on the page. Only nothing at all is nothing -
// which is what getOrdinalNum now returns for a team with no rank.
const hasAttribute = (value) =>
  value !== null && value !== undefined && value !== "";

const FixtureCenterCard = ({
  venue,
  provisional,
  hsideattribute,
  asideattribute,
  winner,
  date,
  currentRound,
  round,
  modelResults,
  id,
  hteam,
  ateam,
  habrev,
  aabrev,
  odds,
}) => {
  let modelId = null;
  let homeConfidence = null;
  let margin = null;
  if (modelResults) {
    modelResults.map((game) => {
      if (game.gameid === id) {
        // console.log(modelResult);
        modelId = game.gameid;
        homeConfidence = game.hconfidence;
        margin = game.margin;
      }
      return game;
    });
  }

  // The padding stays an inline style rather than moving into sx. MUI gives
  // CardContent a `:last-child { padding-bottom: 24px }` rule, and that
  // selector outranks the single class sx generates - so padding written as
  // sx would lose its bottom half. An inline style beats both.
  return (
    <CardContent
      sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}
      style={{ padding: "5px", height: "100%", width: "100%" }}
    >
      {/* width 100%, because the CardContent above is a flex container and a
          flex item with no width set shrinks to its own content rather than
          filling what it is given. This grid was taking 68px of a 405px card,
          which squeezed the middle column - venue, and now the start time
          beside it - into a third of the room it had. Long-standing: the flex
          came in with the old `justify` class. It only became visible when
          that column had two things to fit rather than one. */}
      <Grid container spacing={0} sx={{ width: "100%" }}>
        {/* The date used to have a row of its own here, in two responsive
            forms, on every card - so a four-game Saturday said "Saturday
            September 5th" four times. The day is a heading above the group
            now (see TipsPage), and the card carries only what differs between
            games on it: where, and what time.

            Times are formatted in the reader's own timezone. This used to
            force utcOffset(300) - UTC+5, which is nowhere in Australia - so a
            game that bounced at 7:30pm in Melbourne read as 4:30pm to
            everyone, wherever they were. Left alone, moment uses the
            browser's zone, so Victoria sees 7:30pm and Perth sees 5:30pm for
            the same match. */}

        {/* size={12} as well as container. A nested Grid container has to be
            an item of its parent too, or MUI gives its own children no column
            width - so the scores and venue collapsed to their text width and
            ran together on one line, "114Adelaide Oval 86", instead of the
            scores sitting at either edge with the venue between them. */}
        <Grid container size={12} spacing={0}>
          <Grid
            size={2}
            sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}
          >
            {currentRound >= round && hasAttribute(hsideattribute) ? (
              <Typography variant="h6" component="p">{hsideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
          {/* Ground and start time on one row from sm up, which is what this
              is for. Below that they stack.

              Not a choice so much as an admission: this column is eight
              twelfths of a card that is itself half the fixture row, so on a
              375px phone it is about 110px wide and "Docklands · 5:30pm" has
              nowhere to fit. Left to wrap on its own it broke after the
              separator, leaving a "·" dangling at the end of the first line.
              Breaking it deliberately drops the separator with it. */}
          <Grid size={8}>
            {/* Squiggle only knows where and when once it knows who.
                Until a final has its two sides, the ground and time it sends
                are a placeholder, and the data says so plainly: both
                semi-finals arrive at the M.C.G. at the same minute, as do
                both preliminary finals, and the Grand Final comes through at
                7:20pm - a match that has never been played at night. Compare
                Finals Week 1, where the teams are known: four grounds, four
                times, all real.

                So we do not repeat it as fact. Named rather than left blank,
                because an empty row reads as something we failed to load
                rather than something nobody has decided yet. */}
            {provisional ? (
              <Typography
                variant="subtitle2"
                gutterBottom
                sx={{ color: "text.secondary" }}
              >
                Venue and time to be confirmed
              </Typography>
            ) : (
            <Typography variant="subtitle2" gutterBottom>
              {venue}
              {date ? (
                <Box
                  component="span"
                  sx={{
                    color: "text.secondary",
                    display: { xs: "block", sm: "inline" },
                  }}
                >
                  <Box
                    component="span"
                    sx={{ display: { xs: "none", sm: "inline" } }}
                  >
                    {" · "}
                  </Box>
                  {Moment(date).format("h:mma")}
                </Box>
              ) : null}
            </Typography>
            )}
          </Grid>
          <Grid
            size={2}
            sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}
          >
            {currentRound >= round && hasAttribute(asideattribute) ? (
              <Typography variant="h6" component="p">{asideattribute}</Typography>
            ) : (
              ""
            )}
          </Grid>
        </Grid>
        {/* Prices at the edges, the prediction between them.

            Flex rather than a 2/8/2 grid like the row above: the price columns
            take only the width their content needs and give the rest to the
            middle, so a card with no odds leaves the prediction exactly the
            room it has always had. A fixed grid would reserve two columns of
            empty space on every card in every round the books have not priced.

            Two different kinds of thing sitting side by side, which is worth
            being clear about: Squiggle's percentage is a model's opinion, the
            prices are what a bookmaker will actually pay. Neither touches
            tipping, scoring or the ladder. */}
        <Grid
          size={12}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 0.5,
            // Below sm the three do not fit on one line. This card is half a
            // fixture row, so on a 375px phone it is about 187px wide, and two
            // prices either side leave the prediction roughly 90px - enough to
            // break "COL (53%) by 3 points" across four lines and make every
            // card half as tall again.
            //
            // So on xs they wrap: the prediction takes the first line on its
            // own and the two prices share the second, still pushed to either
            // edge. Same three elements, no duplicated markup - the order and
            // width below are what move them.
            flexWrap: { xs: "wrap", sm: "nowrap" },
          }}
        >
          {/* Hidden once a game has a result, on the same rule as the
              prediction below: both are statements about a game nobody knows
              the outcome of, and a price beside a final score reads as current
              when it is nothing of the sort. */}
          {!winner && odds ? (
            <FixtureOdds
              side={odds.home}
              fetchedAt={odds.fetchedAt}
              teamName={hteam}
              align="flex-start"
            />
          ) : null}

          {/* order -1 and a full width on xs are what put the prediction on
              the first line and leave the prices to wrap below it. From sm it
              goes back to sitting between them and taking the spare room. */}
          <Box
            sx={{
              flexGrow: 1,
              minWidth: 0,
              width: { xs: "100%", sm: "auto" },
              order: { xs: -1, sm: 0 },
            }}
          >
          <Typography variant="subtitle1" gutterBottom>
            {winner}
          </Typography>
          {/* The prediction was wrapped in a Typography of its own, so each
              link below sat inside a second one - a subtitle nested in a
              subtitle. It contributed nothing but that nesting. */}
            {/* modelId guards fixtures Squiggle has no prediction for - a final
                whose teams are not decided yet would otherwise advertise
                "(100%) by 0 points" against two blank sides. */}
            {!winner && modelId ? (
              homeConfidence > 50 ? (
                <a
                  href={`https://squiggle.com.au/game/?gid=${modelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Typography variant="subtitle1" gutterBottom>
                    {habrev} ({Math.round(homeConfidence)}%) by{" "}
                    {Math.round(margin)} points
                  </Typography>
                </a>
              ) : (
                <a
                  href={`https://squiggle.com.au/game/?gid=${modelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Typography variant="subtitle1" gutterBottom>
                    {aabrev} ({100 - Math.round(homeConfidence)}%) by{" "}
                    {Math.round(margin)} points
                  </Typography>
                </a>
              )
            ) : (
              ""
            )}
          </Box>

          {!winner && odds ? (
            <FixtureOdds
              side={odds.away}
              fetchedAt={odds.fetchedAt}
              teamName={ateam}
              align="flex-end"
            />
          ) : null}
        </Grid>
      </Grid>
    </CardContent>
  );
};

export default FixtureCenterCard;

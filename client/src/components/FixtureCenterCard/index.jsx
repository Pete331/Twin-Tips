import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Moment from "moment";


// This slot carries a ladder position before a game and a score after it, so
// the emptiness test cannot be plain truthiness: a side that kicked 0 is a
// real score and has to stay on the page. Only nothing at all is nothing -
// which is what getOrdinalNum now returns for a team with no rank.
const hasAttribute = (value) =>
  value !== null && value !== undefined && value !== "";

const FixtureCenterCard = ({
  venue,
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
      <Grid container spacing={0}>
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
        <Grid size={12}>
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
        </Grid>
      </Grid>
    </CardContent>
  );
};

export default FixtureCenterCard;

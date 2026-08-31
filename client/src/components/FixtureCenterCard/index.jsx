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
        {/* Formatted in the reader's own timezone. These used to force
            utcOffset(300) - UTC+5, which is nowhere in Australia - so a game
            that bounced at 7:30pm in Melbourne read as 4:30pm to everyone,
            wherever they were. Left alone, moment uses the browser's zone, so
            Victoria sees 7:30pm and Perth sees 5:30pm for the same match. */}
        {/* MUI removed the Hidden component, so the short and long date forms
            are shown and hidden with sx breakpoints instead. "Hidden smUp"
            meant visible only below sm; "Hidden xsDown" meant visible from sm
            up. */}
        <Grid size={12} sx={{ display: { xs: "block", sm: "none" } }}>
          <Typography variant="subtitle1" gutterBottom>
            {Moment(date).format("ddd MMM Do, h:mma")}
          </Typography>
        </Grid>
        <Grid size={12} sx={{ display: { xs: "none", sm: "block" } }}>
          <Typography variant="subtitle1" gutterBottom>
            {Moment(date).format("dddd MMMM Do, h:mm a")}
          </Typography>
        </Grid>

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
          <Grid size={8}>
            <Typography variant="subtitle2" gutterBottom>
              {venue}
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

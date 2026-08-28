import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const RulesPage = () => {
  const bullet = { listStyleType: "circle" };

  return (
    <div>
      <Container maxWidth="md">
        <Box
          sx={{
            boxShadow: 3,
            pl: 6,
            pr: 6,
            pt: 1,
            pb: 1,
            mb: 2,
            mt: 5,
            bgcolor: "background.paper"
          }}>
          <div>
            <Typography variant="h5" component="h1" gutterBottom>
              How to play
            </Typography>
            <ul>
              <li style={bullet}>Tip two teams to win each round.</li>
              <li style={bullet}>
                One from the Top 8 and one from the Bottom 10, based on the
                ladder at the end of the previous round.
              </li>
              <li style={bullet}>
                Add a margin to one of your two selections, not both.
              </li>
              {/* Rounds, not weeks. A bye means a week is not always a round,
                  and the check compares against the previous round's tip. */}
              <li style={bullet}>
                You can&apos;t pick the same team in consecutive rounds.
              </li>

              {/* The deadline was enforced everywhere and written down
                  nowhere - it lived only in a tooltip on the tips page. Same
                  wording as that tooltip, deliberately. */}
              <li style={bullet}>
                Tips close when the first game of the round starts. After that
                you can&apos;t enter or edit your selections.
              </li>

              {/* "1 win and a draw will always beat 1 win" left the second
                  "1 win" to be read as "1 win and a loss". Spelled out, since
                  this is the sentence the half-win rule rests on. */}
              <li style={bullet}>
                A drawn match is worth half a win, so one win and a draw beats
                one win and a loss.
              </li>

              {/* Also enforced and unwritten: services/season.js reports
                  tipping closed for finals, because the competition needs a
                  bottom 10 to pick from and the finals do not have one. */}
              <li style={bullet}>
                Tipping runs through the home-and-away season only. There is no
                finals tipping.
              </li>
            </ul>
            {/* The heading was inside the list. A ul may only contain li, so
                a screen reader announcing "list, 5 items" was counting a
                heading as one of them. */}
            <Typography variant="h6" component="h2" gutterBottom>
              Round Results
            </Typography>
            <ul>
              {/* Two corrections here, both against services/results.js.
                  "AND has the smallest margin" read as two conditions that
                  both had to hold; pickWinners takes the most correct tips
                  first and only uses the margin to separate those level on
                  it. And it is the closest margin, not the smallest - the
                  score is the difference between your prediction and the
                  actual result, so predicting a tiny margin is no advantage
                  unless the game is played that way. */}
              <li style={bullet}>
                The round winner is whoever gets the most tips right. If two
                or more are level, the closest margin wins it.
              </li>
              <li style={bullet}>
                Players pay 5 points per round to play, which goes into the
                round pool. Ten players means a 50 point pool.
              </li>
              <li style={bullet}>
                The round winner takes the whole pool.
              </li>
              <li style={bullet}>
                If two or more players tie, the pool is split evenly between
                them.
              </li>
            </ul>
          </div>
        </Box>
      </Container>
    </div>
  );
};

export default RulesPage;

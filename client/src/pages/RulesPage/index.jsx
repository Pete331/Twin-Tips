import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import { WEEKLY, SEASON, typeName } from "../../utils/leagueTypes";

// The rules, laid out as three things rather than one.
//
// It was a single panel holding a page of prose: the rules of tipping, then the
// two league types, all in one run with nothing between them. The two types are
// parallel - the same question answered two ways - and read as a continuation
// of each other rather than as the choice they are.
//
// So: one panel for the rules everybody plays by, and one for each type, side
// by side from md and stacked below it. Parallel content, parallel layout.
//
// The old padding was pl/pr 6 against pt/pb 1 - 48px beside the text and 8px
// above it - which is most of what made it look pasted in. On a 375px phone
// those same 48px left 279px for a sentence. Balanced and responsive now.

// A panel, in the app's own idiom: a white surface on the tinted ground the
// theme paints, lifted by a shadow rather than outlined.
//
// height 100% so two side by side finish level whichever has more in it - the
// alternative is a short card floating beside a long one.
const Panel = ({ children }) => (
  <Box
    sx={{
      height: "100%",
      boxShadow: 3,
      bgcolor: "background.paper",
      borderRadius: 1,
      p: { xs: 2.5, sm: 3.5 },
    }}
  >
    {children}
  </Box>
);

// A list of rules.
//
// Still a ul of lis, so a screen reader still announces "list, eight items" -
// and the headings stay outside it for the same reason, having once been
// counted as items when they sat within.
//
// The browser's own bullet is dropped rather than restyled. It sits inside the
// ul's 40px indent, on top of whatever padding the panel already has, and it
// cannot be sized or coloured: a `circle` marker at body size is a hollow ring
// bigger than the full stop ending the sentence beside it.
const RuleList = ({ children }) => (
  <Box
    component="ul"
    // Spelled out because the style below takes it away. Safari drops list
    // semantics from a ul with list-style: none - VoiceOver stops announcing
    // it as a list at all - and saying the role restores what the marker was
    // carrying.
    role="list"
    sx={{ listStyle: "none", display: "grid", gap: 1.25, m: 0, p: 0 }}
  >
    {children}
  </Box>
);

// One rule, with its marker drawn rather than inherited.
//
// The dot is set against the first line's optical centre rather than its top,
// which is what the 0.55em is doing: a marker on the cap line reads as hanging
// above a rule that wraps to three lines.
const Rule = ({ children }) => (
  <Typography
    component="li"
    sx={{
      display: "flex",
      alignItems: "flex-start",
      gap: 1.5,
      "&::before": {
        content: '""',
        flex: "0 0 auto",
        width: 6,
        height: 6,
        mt: "0.55em",
        borderRadius: "50%",
        bgcolor: "primary.main",
        opacity: 0.5,
      },
    }}
  >
    {children}
  </Typography>
);

// The line under a type's name, saying what kind of thing it is before the
// rules of it start.
const Lede = ({ children }) => (
  <Typography sx={{ color: "text.secondary", mb: 2 }}>{children}</Typography>
);

const SectionHeading = ({ children }) => (
  <Typography variant="h6" component="h2" gutterBottom>
    {children}
  </Typography>
);

const RulesPage = () => (
  // No vertical padding of its own. App's <main> already gives every page
  // pt: 3 and pb: 4, and adding to it here put 64px between the header and the
  // title - which is what the other pages avoid by not doing this.
  <Container maxWidth="md">
    <Typography variant="h5" component="h1" gutterBottom>
      How to play
    </Typography>

    <Box sx={{ display: "grid", gap: 2, mt: 2 }}>
      <Panel>
        {/* The first list had no heading at all, sitting straight under the
            page title while the two below it were both named. */}
        <SectionHeading>Tipping</SectionHeading>
        <RuleList>
          <Rule>Tip two teams to win each round.</Rule>
          {/* Moved here off the create-a-league form, where it was answering
              a question only the person starting a league would ask. It is
              a rule of the competition, so it belongs with the rules. */}
          <Rule>
            You submit one set of tips a round. Every league you are in scores
            those same tips - joining a second one does not mean tipping twice.
          </Rule>
          <Rule>
            One from the Top 8 and one from the Bottom 10, based on the ladder
            at the end of the previous round.
          </Rule>
          <Rule>Add a margin to one of your two selections, not both.</Rule>
          {/* Rounds, not weeks. A bye means a week is not always a round,
              and the check compares against the previous round's tip. */}
          <Rule>You can&apos;t pick the same team in consecutive rounds.</Rule>

          {/* The deadline was enforced everywhere and written down
              nowhere - it lived only in a tooltip on the tips page. Same
              wording as that tooltip, deliberately. */}
          <Rule>
            Tips close when the first game of the round starts. After that you
            can&apos;t enter or edit your selections.
          </Rule>

          {/* "1 win and a draw will always beat 1 win" left the second
              "1 win" to be read as "1 win and a loss". Spelled out, since
              this is the sentence the half-win rule rests on. */}
          <Rule>
            A drawn match is worth half a win, so 1 win and a draw will always
            beat 1 win and a loss.
          </Rule>

          {/* Also enforced and unwritten: services/season.js reports
              tipping closed for finals, because the competition needs a
              bottom 10 to pick from and the finals do not have one. */}
          <Rule>
            Tipping runs through the home-and-away season only. There is no
            finals tipping.
          </Rule>
        </RuleList>
      </Panel>

      {/* The two types, side by side from md. Stacked below it, because two
          columns of rules on a phone is two columns four words wide.

          This section described the buy-in mechanics as though every league
          worked that way. Now that the two types have names, it has to say
          which one it is talking about - a Season Ladder member reading
          "players pay the buy-in each round" would be reading about someone
          else's league. */}
      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, md: 6 }}>
          <Panel>
            {/* Named from leagueTypes rather than written out again, so this
                page cannot drift from the name every other screen uses. */}
            <SectionHeading>{typeName(WEEKLY)} leagues</SectionHeading>
            <Lede>
              The original Twin Tips format. Everyone pays in every round, and
              that round&apos;s money goes to that round&apos;s winner.
            </Lede>
            <RuleList>
              {/* Two corrections here, both against services/results.js.
                  "AND has the smallest margin" read as two conditions that
                  both had to hold; pickWinners takes the most correct tips
                  first and only uses the margin to separate those level on
                  it. And it is the closest margin, not the smallest - the
                  score is the difference between your prediction and the
                  actual result, so predicting a tiny margin is no advantage
                  unless the game is played that way. */}
              <Rule>
                The round winner is whoever gets the most tips right. If two or
                more are level, the closest margin wins it.
              </Rule>
              {/* Dollars, matching the leaderboard - which has always shown
                  amounts that way while this said points. The amount is per
                  league now, so the figure here is an example rather than the
                  rule. */}
              <Rule>
                Players pay the league&apos;s buy-in each round, which goes into
                the round pool. Ten players at $5 makes a $50 pool.
              </Rule>
              <Rule>The round winner takes the whole pool.</Rule>
              <Rule>
                If two or more players tie, the pool is split evenly between
                them.
              </Rule>
            </RuleList>
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Panel>
            {/* Deliberately does not say "no money". Twin Tips not collecting
                a buy-in for this type is a fact about the app; whether a
                league plays for something is up to its members, and a rules
                page that rules it out would be telling them they cannot. */}
            <SectionHeading>{typeName(SEASON)} leagues</SectionHeading>
            <Lede>One table that runs the whole season.</Lede>
            <RuleList>
              <Rule>
                Nothing resets between rounds - correct tips build up across the
                season.
              </Rule>
              {/* Cumulative, and it is the error that is added up: see
                  services/leagueStandings.js, which sorts on points first and
                  then on the total distance between predicted and actual
                  margins. Smallest total wins, so a season of near misses
                  beats one lucky round. */}
              <Rule>
                Anyone level on tips is separated by margin: every round&apos;s
                difference between your prediction and the real result is added
                up, and the smallest total finishes higher.
              </Rule>
              <Rule>
                Twin Tips doesn&apos;t collect or track a buy-in for this type.
                If your league plays for something, that is yours to agree and
                settle between yourselves.
              </Rule>
            </RuleList>
          </Panel>
        </Grid>
      </Grid>
    </Box>
  </Container>
);

export default RulesPage;

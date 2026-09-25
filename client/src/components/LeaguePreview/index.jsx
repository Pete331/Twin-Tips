import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { typeName, typeBlurb } from "../../utils/leagueTypes";

// What a league is, for someone deciding whether to join it.
//
// Drawn from POST /api/leagues/preview, before anything is joined - on the
// invite link's page and in the join-with-code sheet alike. The buy-in is the
// part that matters most: a Round Pool takes it every round, and joining used
// to happen without anyone seeing it (UX audit finding #4).
const LeaguePreview = ({ league, headingComponent = "h2" }) => (
  <Box>
    <Typography variant="h5" component={headingComponent} gutterBottom>
      {league.name}
    </Typography>
    <Typography sx={{ fontWeight: 600 }}>{typeName(league.type)}</Typography>
    <Typography sx={{ mb: 1 }}>
      {typeBlurb(league.type, league.buyIn)}
    </Typography>
    <Typography sx={{ color: "text.secondary" }}>
      {[
        league.admin ? `Run by ${league.admin}` : null,
        `${league.members} ${league.members === 1 ? "member" : "members"}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </Typography>
  </Box>
);

export default LeaguePreview;

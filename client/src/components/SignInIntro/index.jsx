import { Link } from "react-router-dom";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

// The top of the sign-in and register cards: the app's icon, the heading, and
// one line saying what Twin Tips is.
//
// Both were the stock template - a purple lock icon, not a Twin Tips colour,
// over "Login", and not a word about the game. That is the first screen a
// friend opening an invite sees (UX audit finding #30). The icon is the app's
// own, the navy one on a phone's home screen; the wordmark is already in the
// header above, so it is not repeated here.
const SignInIntro = ({ heading }) => (
  <>
    {/* Decorative: the heading beside it says where you are. */}
    <Box
      component="img"
      src="/assets/icon-192.png"
      alt=""
      sx={{ width: 48, height: 48, borderRadius: 1.5, m: 1 }}
    />
    <Typography component="h1" variant="h5">
      {heading}
    </Typography>
    <Typography
      variant="body2"
      sx={{ mt: 1, textAlign: "center", color: "text.secondary" }}
    >
      Pick a Top 8 team and a Bottom 10 team each round. Closest margin breaks
      ties.{" "}
      <MuiLink component={Link} to="/rulespage">
        How to play
      </MuiLink>
    </Typography>
  </>
);

export default SignInIntro;

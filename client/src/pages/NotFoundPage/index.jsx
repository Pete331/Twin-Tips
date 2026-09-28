import { useContext } from "react";
import { Link } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import { AuthContext } from "../../utils/AuthContext";

// Somewhere the app has no page for - a mistyped address, an old bookmark.
//
// It was "404 page not found!" as a bare heading, with no way back to anything
// (UX audit finding #22). Now it says what happened in words a person uses,
// in the same card as the sign-in pages, and has one button out: Home for
// somebody signed in, sign-in for somebody not. The tab already said "Page not
// found" (components/DocumentTitle), so the heading agrees with it.
const NotFound = () => {
  // Read defensively, as the leaderboard does: the page must render even
  // where nothing provides the context.
  const auth = useContext(AuthContext);
  const signedIn = Boolean(auth && auth.user && auth.user.isAuthenticated);

  return (
    <Container maxWidth="xs">
      <Box
        sx={{
          boxShadow: 3,
          p: 3,
          mt: 4,
          bgcolor: "background.paper",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Avatar sx={{ m: 1, bgcolor: "secondary.main" }}>
          <SearchOffIcon />
        </Avatar>
        <Typography component="h1" variant="h5">
          Page not found
        </Typography>
        <Typography variant="body2" sx={{ mt: 2, mb: 3 }}>
          There&apos;s nothing at this address. It may have been mistyped, or
          the page may have moved.
        </Typography>
        <Button
          component={Link}
          to={signedIn ? "/home" : "/login"}
          variant="contained"
          color="primary"
          fullWidth
        >
          {signedIn ? "Go to Home" : "Go to sign in"}
        </Button>
      </Box>
    </Container>
  );
};

export default NotFound;

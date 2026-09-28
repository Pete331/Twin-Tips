import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import API from "../../utils/AuthAPI";
import { AuthContext } from "../../utils/AuthContext";

// Where the link sent to a new email address lands (UX audit finding #23).
// Opening it is what makes the change, so this page does it as it opens and
// then says how it went.
//
// Public, like the reset page: the link is the proof, and it may well be
// opened on a phone that isn't signed in.
const ConfirmEmail = () => {
  const { token } = useParams();
  const auth = useContext(AuthContext);
  const signedIn = Boolean(auth && auth.user && auth.user.isAuthenticated);

  // "working", "done", "dead", "taken" or "failed".
  const [state, setState] = useState("working");
  const [detail, setDetail] = useState("");

  // Once. Confirming is not something to do twice: the second request finds
  // the link used and would report it dead over the top of the first one's
  // success - which is exactly what StrictMode's second run of this effect
  // does in development.
  const asked = useRef(false);

  const confirm = useCallback(() => {
    setState("working");
    API.confirmEmail({ token })
      .then((res) => {
        setDetail(res.data.email);
        setState("done");
      })
      .catch((err) => {
        const status = err && err.response && err.response.status;
        const message =
          err && err.response && err.response.data && err.response.data.message;
        setDetail(message || "");
        setState(status === 422 ? "dead" : status === 409 ? "taken" : "failed");
      });
  }, [token]);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    confirm();
  }, [confirm]);

  const card = (heading, text, action) => (
    <>
      <Typography component="h1" variant="h5">
        {heading}
      </Typography>
      <Typography variant="body2" sx={{ mt: 2, mb: action ? 3 : 0 }}>
        {text}
      </Typography>
      {action}
    </>
  );

  const toProfile = (label) => (
    <Button
      component={Link}
      to={signedIn ? "/settings" : "/login"}
      variant="contained"
      fullWidth
    >
      {signedIn ? label : "Sign in"}
    </Button>
  );

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
          <MarkEmailReadIcon />
        </Avatar>
        {state === "working" ? (
          <Typography role="status">Confirming your new email...</Typography>
        ) : state === "done" ? (
          card(
            "Email changed",
            `Your email is now ${detail}. Sign in and reset your password with it from now on.`,
            <Button
              component={Link}
              to={signedIn ? "/home" : "/login"}
              variant="contained"
              fullWidth
            >
              {signedIn ? "Go to Home" : "Sign in"}
            </Button>
          )
        ) : state === "dead" ? (
          card(
            "This link has expired",
            "A confirmation link works once, for an hour. Ask for a new one from your Profile - your email hasn't changed.",
            toProfile("Go to Profile")
          )
        ) : state === "taken" ? (
          card(
            "That email is taken",
            detail ||
              "Somebody else has registered that address since you asked. Your email hasn't changed.",
            toProfile("Go to Profile")
          )
        ) : (
          card(
            "That didn't work",
            "We couldn't confirm your new email just now. Your email hasn't changed.",
            <Button variant="contained" fullWidth onClick={confirm}>
              Try again
            </Button>
          )
        )}
      </Box>
    </Container>
  );
};

export default ConfirmEmail;

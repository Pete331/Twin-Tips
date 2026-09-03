import { useState, useContext, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { Link, useNavigate, useLocation } from "react-router-dom";
// MUI's Link rendering react-router's. variant is a MUI prop: on a bare router
// Link it was passed straight through to the anchor, where it landed as a
// literal variant="body2" attribute and did nothing - these links have been
// rendering at 16px, not the 14px they asked for.
import MuiLink from "@mui/material/Link";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import PasswordField from "../../components/PasswordField";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import API from "../../utils/AuthAPI";
import Alert from "../../components/Alerts";
import { validEmail, validPassword } from "../../utils/ValidationHelpers";

const SignIn = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const alertRef = useRef();

  const { setUser } = useContext(AuthContext);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [validation, setvalidation] = useState({
    emailError: null,
    passwordError: null,
  });

  // Sign-in can take a noticeable moment - a cold server especially, where
  // Render's free tier spins down and the first request waits for it to wake.
  // Without this the button gave no sign it had been pressed.
  const [signingIn, setSigningIn] = useState(false);

  const validationCheck = () => {
    if (formData.email === "") {
      setvalidation({
        ...validation,
        emailError: "Enter your username or email",
      });
      return false;
    }

    // This field takes either now, so it cannot simply be validated as an
    // email - doing so rejected every username before it was ever sent. Only
    // something that is trying to be an email gets checked as one; the server
    // decides the rest, since only it knows which usernames exist.
    if (formData.email.includes("@") && !validEmail(formData.email)) {
      setvalidation({
        ...validation,
        emailError: "Please enter a valid email address",
      });
      return false;
    }

    if (formData.password === "") {
      setvalidation({
        ...validation,
        passwordError: "Password cannot be blank",
      });
      return false;
    }

    if (!validPassword(formData.password)) {
      setvalidation({
        ...validation,
        passwordError:
          "Invalid password! Should be eight characters in length, at least one letter & one number.",
      });
      return false;
    }

    return true;
  };

  const handleChange = (event) => {
    let { value, name } = event.currentTarget;
    setFormData({ ...formData, [name]: value });
    resetForms();
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    let valid = validationCheck();
    // Only a bounced PrivateRoute visit supplies `from`. Pages that arrive here
    // carrying just an alert still have a location.state, so read the field
    // rather than testing the object, or `from` lands here undefined and the
    // post-login navigate quietly does nothing.
    const from = (location.state && location.state.from) || {
      pathname: "/home",
    };

    // Ignore a second click while the first is still in flight. Sign-in is
    // rate limited on failures, so an impatient double-click could spend two
    // of the twenty attempts on one password.
    if (valid && !signingIn) {
      setSigningIn(true);

      API.login(formData)
        .then((res) => {
          setUser({
            isAuthenticated: res.data.isAuthenticated,
            name: res.data.user,
            id: res.data.id,
            // Same as PrivateRoute: the avatar shows one initial from each
            // name, and the username is a single word with no way to tell a
            // first name from a last.
            firstName: res.data.firstName,
            lastName: res.data.lastName,
          });

          navigate(from, { replace: true });
        })
        .catch((err) => {
          // err.response is missing when the request never got an answer - the
          // server is down, or the dev proxy has nothing behind it. Reading
          // .status off it threw, which took the whole handler down: no alert,
          // no spinner reset, the button just sat there. That is the "clicked
          // it and nothing happened" case, and it is the one where the user
          // most needs to be told something.
          const status = err.response && err.response.status;

          if (status === 401) {
            alertRef.current.createAlert(
              "error",
              "Incorrect username or password.",
              true
            );
          } else if (!status || status === 502 || status === 503) {
            // Naming it beats "something went wrong": this one is not the
            // password, and retrying will not fix it.
            alertRef.current.createAlert(
              "error",
              "Can't reach the server. Is it running?",
              true
            );
          } else {
            alertRef.current.createAlert(
              "error",
              "Oops, something went wrong.",
              true
            );
          }

          // Only on failure. A success navigates away, and setting state on a
          // component that has gone is a warning for no gain.
          setSigningIn(false);
        });
    }
  };

  const resetForms = () => {
    if (validation.emailError !== null || validation.passwordError !== null) {
      setvalidation({
        emailError: null,
        passwordError: null,
      });
    }
  };

  return (
    <div>
      <Container maxWidth="xs">
        <CssBaseline />
        <Box
          sx={{
            boxShadow: 3,
            pl: 3,
            pr: 3,
            pb: 3,
            bgcolor: "background.paper"
          }}>
        <Box
          sx={{
            mt: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: "secondary.main" }}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography component="h1" variant="h5">
            Login
          </Typography>
          <Alert ref={alertRef} />
          <Box
              component="form"
              sx={{ width: "100%", mt: 1 }}
              noValidate
              onSubmit={handleSubmit}
            >
            <TextField
              error={validation.emailError ? true : false}
              helperText={validation.emailError}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="email"
              label="Username or Email"
              name="email"
              autoComplete="username"
              autoFocus
              onChange={handleChange}
              value={formData.email}
            />
            <PasswordField
              error={validation.passwordError ? true : false}
              helperText={validation.passwordError}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              id="password"
              autoComplete="current-password"
              onChange={handleChange}
              value={formData.password}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              sx={{ mt: 3, mb: 2 }}
              disabled={signingIn}
              startIcon={
                signingIn ? (
                  <CircularProgress size={18} color="inherit" />
                ) : null
              }
            >
              {signingIn ? "Logging in" : "Login"}
            </Button>
            {/* Stacked below sm, side by side above it. Side by side at every
                width meant the "grow" item took whatever the longer link on
                the right left over - on a phone that was 79px, so "Forgot
                password?" broke across two lines into its neighbour. */}
            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: "grow" }}>
                <MuiLink component={Link} to="/forgot" variant="body2">
                  Forgot password?
                </MuiLink>
              </Grid>
              <Grid size={{ xs: 12, sm: "auto" }}>
                <MuiLink component={Link} to="/register" variant="body2">
                  {"Don't have an account? Register"}
                </MuiLink>
              </Grid>
            </Grid>
          </Box>
        </Box>
        </Box>
      </Container>
    </div>
  );
};

export default SignIn;

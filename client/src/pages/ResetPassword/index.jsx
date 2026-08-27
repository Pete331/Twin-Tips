import { useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
// See the note in LoginPage: variant is a MUI prop and did nothing on a bare
// router Link.
import MuiLink from "@mui/material/Link";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import PasswordField from "../../components/PasswordField";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import Typography from "@mui/material/Typography";
import useStyles from "./style";
import Container from "@mui/material/Container";
import API from "../../utils/AuthAPI";
import Alert from "../../components/Alerts";

const ForgotPassword = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  // react-router 7 renders routes via element={}, so there is no props.match.
  // Route params come from the useParams hook instead.
  const { token } = useParams();
  const alertRef = useRef();

  const [formData, setFormData] = useState({
    token,
    password: "",
    confirmPassword: "",
  });

  const [validation, setvalidation] = useState({
    passwordError: null,
    confirmPasswordError: null,
  });

  const validationCheck = () => {
    if (formData.password === "") {
      setvalidation({
        ...validation,
        passwordError: "Password cannot be blank",
      });
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setvalidation({
        ...validation,
        confirmPasswordError: "Passwords do not match",
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

    if (valid) {
      API.resetPassword(formData)
        .then((res) => {
          navigate("/login", {
            state: {
              alert: {
                type: "success",
                message: "Successfully Changed! Please log in.",
                show: true,
              },
            },
          });
        })
        .catch((err) => {
          let data = err.response.data;

          if (data) {
            alertRef.current.createAlert("error", data.message, true);
          } else {
            alertRef.current.createAlert(
              "error",
              "Oops, something went wrong!",
              true
            );
          }
        });
    }
  };

  const resetForms = () => {
    if (
      validation.passwordError !== null ||
      validation.confirmPasswordError !== null
    ) {
      setvalidation({
        passwordError: null,
        confirmPasswordError: null,
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
          <div className={classes.paper}>
            <Avatar className={classes.avatar}>
              <VpnKeyIcon />
            </Avatar>
            <Typography component="h1" variant="h5">
              Create New Password
            </Typography>
            <Typography variant="body2" className={classes.text}>
              Your password must be at least 8 characters long, contain at least
              one letter and one number.
            </Typography>
            <Alert ref={alertRef} />
            <form className={classes.form} noValidate onSubmit={handleSubmit}>
              <PasswordField
                error={validation.passwordError ? true : false}
                helperText={validation.passwordError}
                variant="outlined"
                margin="normal"
                required
                fullWidth
                id="password"
                label="New Password"
                name="password"
                autoFocus
                onChange={handleChange}
                value={formData.password}
              />
              <PasswordField
                error={validation.confirmPasswordError ? true : false}
                helperText={validation.confirmPasswordError}
                variant="outlined"
                margin="normal"
                required
                fullWidth
                id="confirmPassword"
                label="Confirm Password"
                name="confirmPassword"
                onChange={handleChange}
                value={formData.confirmPassword}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                color="primary"
                className={classes.submit}
              >
                Set New Password
              </Button>
              {/* Stacked below sm, side by side above it. "Back to Home Page"
                  and "Just Remembered? Login" are the longest pair in the app,
                  so this row ran out of width first. */}
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, sm: "grow" }}>
                  <MuiLink component={Link} to="/" variant="body2">
                    Back to Home Page
                  </MuiLink>
                </Grid>
                <Grid size={{ xs: 12, sm: "auto" }}>
                  <MuiLink component={Link} to="/login" variant="body2">
                    Just Remembered? Login
                  </MuiLink>
                </Grid>
              </Grid>
            </form>
          </div>
        </Box>
      </Container>
    </div>
  );
};

export default ForgotPassword;

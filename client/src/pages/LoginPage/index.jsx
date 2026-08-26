import React, { useState, useContext, useRef } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { Link, useHistory, useLocation } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import useStyles from "./style";
import Container from "@mui/material/Container";
import API from "../../utils/AuthAPI";
import Alert from "../../components/Alerts";
import { validEmail, validPassword } from "../../utils/ValidationHelpers";

const SignIn = (props) => {
  const classes = useStyles();
  const history = useHistory();
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

  const validationCheck = () => {
    if (formData.email === "") {
      setvalidation({ ...validation, emailError: "Email cannot be blank" });
      return false;
    }

    if (!validEmail(formData.email)) {
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
    let { from } = location.state || { from: { pathname: "/dashboard" } };

    if (valid) {
      API.login(formData)
        .then((res) => {
          setUser({
            isAuthenticated: res.data.isAuthenticated,
            name: res.data.user,
            id: res.data.id,
          });

          history.replace(from);
        })
        .catch((err) => {
          let status = err.response.status;

          if (status === 401) {
            alertRef.current.createAlert(
              "error",
              "Incorrect username or password.",
              true
            );
          } else {
            alertRef.current.createAlert(
              "error",
              "Oops, something went wrong.",
              true
            );
          }
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
      <Container component="main" maxWidth="xs" className="container">
        <CssBaseline />
        <Box boxShadow={3} pl={3} pr={3} pb={3} className="Box">
        <div className={classes.paper}>
          <Avatar className={classes.avatar}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography component="h1" variant="h5">
            Sign in
          </Typography>
          <Alert ref={alertRef} />
          <form className={classes.form} noValidate onSubmit={handleSubmit}>
            <TextField
              error={validation.emailError ? true : false}
              helperText={validation.emailError}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              onChange={handleChange}
              value={formData.email}
            />
            <TextField
              error={validation.passwordError ? true : false}
              helperText={validation.passwordError}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
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
              className={classes.submit}
            >
              Sign In
            </Button>
            <Grid container>
              <Grid size="grow">
                <Link to="/forgot" variant="body2">
                  Forgot password?
                </Link>
              </Grid>
              <Grid>
                <Link to="/register" variant="body2">
                  {"Don't have an account? Sign Up"}
                </Link>
              </Grid>
            </Grid>
          </form>
        </div>
        </Box>
      </Container>
    </div>
  );
};

export default SignIn;

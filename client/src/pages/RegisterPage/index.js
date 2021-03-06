import React, { useState, useRef } from "react";
import { Link, useHistory } from "react-router-dom";
import Avatar from "@material-ui/core/Avatar";
import Button from "@material-ui/core/Button";
import CssBaseline from "@material-ui/core/CssBaseline";
import TextField from "@material-ui/core/TextField";
import Grid from "@material-ui/core/Grid";
import Box from "@material-ui/core/Box";
import LockOutlinedIcon from "@material-ui/icons/LockOutlined";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Select from "@material-ui/core/Select";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import useStyles from "./style";
import API from "../../utils/AuthAPI";
import Alert from "../../components/Alerts";
import { validEmail, validPassword } from "../../utils/ValidationHelpers";

const Register = () => {
  const classes = useStyles();
  const history = useHistory();
  const alertRef = useRef();

  const [validation, setvalidation] = useState({
    firstNameError: null,
    lastNameError: null,
    emailError: null,
    passwordError: null,
  });

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    favTeam: "",
  });

  const validationCheck = () => {
    if (formData.firstName === "") {
      setvalidation({
        ...validation,
        firstNameError: "First Name cannot be blank",
      });
      return false;
    }

    if (formData.lastName === "") {
      setvalidation({
        ...validation,
        lastNameError: "Last Name cannot be blank",
      });
      return false;
    }

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
          "Requires eight characters, at least one letter & one number",
      });
      return false;
    }

    if (formData.favTeam === "") {
      setvalidation({
        ...validation,
        favTeamError: "notblank",
      });
      return false;
    }

    return true;
  };

  const handleChange = (event) => {
    let { value, name } = event.currentTarget;
    setFormData({ ...formData, [name]: value });
    clearValidation();
  };

  function handleSelectChange(event) {
    setFormData({ ...formData, favTeam: event.target.value });
    clearValidation();
  }

  const handleSubmit = (event) => {
    event.preventDefault();

    let valid = validationCheck();

    if (valid) {
      API.register(formData)
        .then((res) => {
          history.push({
            pathname: "/login",
            alert: {
              type: "success",
              message: res.data.message,
              show: true,
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

  const clearValidation = () => {
    if (validation.NameError !== null) {
      setvalidation({
        firstNameError: null,
        lastNameError: null,
        emailError: null,
        passwordError: null,
        favTeamError: null,
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
            Sign up
          </Typography>
          <Alert ref={alertRef} />
          <form className={classes.form} noValidate onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  error={validation.firstNameError ? true : false}
                  helperText={validation.firstNameError}
                  variant="outlined"
                  required
                  fullWidth
                  id="firstName"
                  label="First Name"
                  name="firstName"
                  autoFocus
                  onChange={handleChange}
                  value={formData.firstName}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  error={validation.lastNameError ? true : false}
                  helperText={validation.lastNameError}
                  variant="outlined"
                  required
                  fullWidth
                  id="lastName"
                  label="Last Name"
                  name="lastName"
                  onChange={handleChange}
                  value={formData.lastName}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  error={validation.emailError ? true : false}
                  helperText={validation.emailError}
                  variant="outlined"
                  required
                  fullWidth
                  id="email"
                  label="Email Address"
                  name="email"
                  onChange={handleChange}
                  value={formData.email}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  error={validation.passwordError ? true : false}
                  helperText={validation.passwordError}
                  variant="outlined"
                  required
                  fullWidth
                  label="Password"
                  type="password"
                  id="password"
                  name="password"
                  onChange={handleChange}
                  value={formData.password}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel id="favTeam">
                    Which team do you support?
                  </InputLabel>
                  <Select
                    error={validation.favTeamError ? true : false}
                    variant="outlined"
                    required
                    label="Favourite Team"
                    id="favTeam"
                    name="favTeam"
                    onChange={handleSelectChange}
                    value={formData.favTeam}
                  >
                    <MenuItem value={1}>Adelaide</MenuItem>
                    <MenuItem value={2}>Brisbane Lions</MenuItem>
                    <MenuItem value={3}>Carlton</MenuItem>
                    <MenuItem value={4}>Collingwood</MenuItem>
                    <MenuItem value={5}>Essendon</MenuItem>
                    <MenuItem value={6}>Fremantle</MenuItem>
                    <MenuItem value={7}>Geelong</MenuItem>
                    <MenuItem value={8}>Gold Coast</MenuItem>
                    <MenuItem value={9}>Greater Western Sydney</MenuItem>
                    <MenuItem value={10}>Hawthorn</MenuItem>
                    <MenuItem value={11}>Melbourne</MenuItem>
                    <MenuItem value={12}>North Melbourne</MenuItem>
                    <MenuItem value={13}>Port Adelaide</MenuItem>
                    <MenuItem value={14}>Richmond</MenuItem>
                    <MenuItem value={15}>St Kilda</MenuItem>
                    <MenuItem value={16}>Sydney</MenuItem>
                    <MenuItem value={17}>West Coast</MenuItem>
                    <MenuItem value={18}>Western Bulldogs</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              className={classes.submit}
            >
              Sign Up
            </Button>
            <Grid container justify="flex-end">
              <Grid item>
                <Link to="/login" variant="body2">
                  Already have an account? Sign in
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

export default Register;

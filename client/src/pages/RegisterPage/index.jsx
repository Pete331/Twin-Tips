import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import MuiLink from "@mui/material/Link";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import PasswordField from "../../components/PasswordField";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Select from "@mui/material/Select";
import { MENU_BELOW } from "../../utils/selectMenu";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import useStyles from "./style";
import API from "../../utils/AuthAPI";
import Alert from "../../components/Alerts";
import {
  validEmail,
  validPassword,
  validUsername,
  USERNAME_RULE,
} from "../../utils/ValidationHelpers";

const Register = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const alertRef = useRef();

  const [validation, setvalidation] = useState({
    firstNameError: null,
    lastNameError: null,
    usernameError: null,
    emailError: null,
    passwordError: null,
  });

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
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

    if (formData.username === "") {
      setvalidation({
        ...validation,
        usernameError: "Username cannot be blank",
      });
      return false;
    }

    if (!validUsername(formData.username)) {
      setvalidation({ ...validation, usernameError: USERNAME_RULE });
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
          navigate("/login", {
            state: {
              alert: {
                type: "success",
                message: res.data.message,
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

  const clearValidation = () => {
    if (validation.NameError !== null) {
      setvalidation({
        firstNameError: null,
        lastNameError: null,
        usernameError: null,
        emailError: null,
        passwordError: null,
        favTeamError: null,
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
            <LockOutlinedIcon />
          </Avatar>
          <Typography component="h1" variant="h5">
            Sign up
          </Typography>
          <Alert ref={alertRef} />
          <form className={classes.form} noValidate onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
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
              <Grid size={{ xs: 12, sm: 6 }}>
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
              <Grid size={12}>
                {/* Between the name fields and the email, because this is the
                    name other people see - the leaderboard and the dashboard
                    show it rather than the first and last name above. */}
                <TextField
                  error={validation.usernameError ? true : false}
                  helperText={
                    validation.usernameError ||
                    "This is the name shown on the leaderboard."
                  }
                  variant="outlined"
                  required
                  fullWidth
                  id="username"
                  label="Username"
                  name="username"
                  autoComplete="username"
                  onChange={handleChange}
                  value={formData.username}
                />
              </Grid>
              <Grid size={12}>
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
              <Grid size={12}>
                <PasswordField
                  error={validation.passwordError ? true : false}
                  helperText={validation.passwordError}
                  variant="outlined"
                  required
                  fullWidth
                  label="Password"
                  id="password"
                  name="password"
                  onChange={handleChange}
                  value={formData.password}
                />
              </Grid>
              <Grid size={12}>
                <FormControl fullWidth>
                  <InputLabel id="favTeam-label">
                    Which team do you support?
                  </InputLabel>
                  <Select
                    MenuProps={MENU_BELOW}
                    error={validation.favTeamError ? true : false}
                    variant="outlined"
                    required
                    // labelId ties the Select to the label above, and label
                    // has to repeat that same text: it is what sizes the gap
                    // cut in the outline. It read "Favourite Team" while the
                    // label said "Which team do you support?", so the notch
                    // was cut for the shorter of the two and the rest of the
                    // words sat across the border.
                    labelId="favTeam-label"
                    label="Which team do you support?"
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
              sx={{ mt: 3, mb: 2 }}
            >
              Sign Up
            </Button>
            <Grid container sx={{
              justifyContent: "flex-end"
            }}>
              <Grid>
                <MuiLink component={Link} to="/login" variant="body2">
                  Already have an account? Sign in
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

export default Register;

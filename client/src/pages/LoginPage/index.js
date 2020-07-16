import React, { useState, useContext, useRef } from 'react';
import { AuthContext } from '../../utils/AuthContext';
import { Link, useHistory, useLocation } from 'react-router-dom';
import Avatar from '@material-ui/core/Avatar';
import Button from '@material-ui/core/Button';
import CssBaseline from '@material-ui/core/CssBaseline';
import TextField from '@material-ui/core/TextField';
import Grid from '@material-ui/core/Grid';
import Box from '@material-ui/core/Box';
import LockOutlinedIcon from '@material-ui/icons/LockOutlined';
import Typography from '@material-ui/core/Typography';
import useStyles from './style';
import Container from '@material-ui/core/Container';
import Footer from '../../components/Footer';
import API from '../../utils/API';
import Alert from '../../components/Alerts';
import { validEmail, validPassword } from '../../utils/ValidationHelpers';

const SignIn = (props) => {
  const classes = useStyles();
  const history = useHistory();
  const location = useLocation();
  const alertRef = useRef();
  
  const { setUser } = useContext(AuthContext);

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const [validation, setvalidation] = useState({
    emailError: null,
    passwordError: null
  })

  const validationCheck = () => {
    if (formData.email === "") {
      setvalidation({...validation, emailError: "Email cannot be blank"})
      return false
    }

    if (!validEmail(formData.email)) {
      setvalidation({...validation, emailError: "Please enter a valid email address"})
      return false
    }

    if (formData.password === "") {
      setvalidation({...validation, passwordError: "Password cannot be blank"})
      return false
    }

    if (!validPassword(formData.password)) {
      setvalidation({...validation, passwordError: "Invalid password! Should be eight characters in length, at least one letter & one number."})
      return false
    }

    return true
  }
  
  const handleChange = (event) => {
    let {value, name} = event.currentTarget;
    setFormData({...formData, [name]:value})
    resetForms()
  }
  
  
  const handleSubmit = (event) => {
    event.preventDefault()
    
    let valid = validationCheck();
    let { from } = location.state || { from: {pathname: "/dashboard"}};
    
    if (valid) {
      API.login(formData)
      .then(res => {

        setUser({
          isAuthenticated: res.data.isAuthenticated,
          name: res.data.user,
          id: res.data.id
        });
  
        history.replace(from)
      })
      .catch(err => {
        let status = err.response.status;

        if ( status === 401 ) {
          alertRef.current.createAlert("error", "Incorrect username or password.", true);
        } else {
          alertRef.current.createAlert("error", "Oops, something went wrong.", true);
        }
      })
    }
  }

  const resetForms = () => {
    if (validation.emailError !== null || validation.passwordError !== null) {
      setvalidation({
        emailError: null,
        passwordError: null
      })
    }
  }

  return (
    <Container component="main" maxWidth="xs">
      <CssBaseline />
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
            error = {validation.emailError ? true : false}
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
            error = {validation.passwordError ? true : false}
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
            <Grid item xs>
              <Link to="/forgot" variant="body2">
                Forgot password?
              </Link>
            </Grid>
            <Grid item>
              <Link to="/register" variant="body2">
                {"Don't have an account? Sign Up"}
              </Link>
            </Grid>
          </Grid>
        </form>
      </div>
      <Box mt={8}>
        <Footer />
      </Box>
    </Container>
  );
}

export default SignIn;
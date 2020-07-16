import React, { useState, useRef } from 'react';
import { Link, useHistory } from 'react-router-dom';
import Avatar from '@material-ui/core/Avatar';
import Button from '@material-ui/core/Button';
import CssBaseline from '@material-ui/core/CssBaseline';
import TextField from '@material-ui/core/TextField';
import Grid from '@material-ui/core/Grid';
import Box from '@material-ui/core/Box';
import LockOutlinedIcon from '@material-ui/icons/LockOutlined';
import Typography from '@material-ui/core/Typography';
import Container from '@material-ui/core/Container';
import Footer from '../../components/Footer';
import useStyles from './style';
import API from '../../utils/API';
import Alert from '../../components/Alerts';
import { validEmail, validPassword } from '../../utils/ValidationHelpers'

const Register = () => {
  const classes = useStyles();
  const history = useHistory();
  const alertRef = useRef();

  const [validation, setvalidation] = useState({
    firstNameError: null,
    lastNameError: null,
    emailError: null,
    passwordError: null
  })
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  })

  const validationCheck = () => {
    if (formData.firstName === "") {
      setvalidation({...validation, firstNameError: "First Name cannot be blank"})
      return false
    }
    
    if (formData.lastName === "") {
      setvalidation({...validation, lastNameError: "Last Name cannot be blank"})
      return false
    }

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
      setvalidation({...validation, passwordError: "Requires eight characters, at least one letter & one number"})
      return false
    }

    return true
  }
  
  const handleChange = (event) => {
    let {value, name} = event.currentTarget;
    setFormData({...formData, [name]:value})
    clearValidation()
  }
  
  const handleSubmit = (event) => {
    event.preventDefault()

    let valid = validationCheck()
    
    if (valid) {
      API.register(formData)
      .then(res => {
        history.push({
          pathname: '/login',
          alert: {
            type: "success", 
            message: res.data.message, 
            show:true
          }
        })
      })
      .catch(err => {
        let data = err.response.data;

        if ( data ) {
          alertRef.current.createAlert("error", data.message, true);
        } else {
          alertRef.current.createAlert("error", "Oops, something went wrong!", true);
        }
      })
    }
  }

  const clearValidation = () => {
    if (validation.NameError !== null){
      setvalidation({
        firstNameError: null,
        lastNameError: null,
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
          Sign up
        </Typography>
        <Alert ref={alertRef} />
        <form className={classes.form} noValidate onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                error = {validation.firstNameError ? true : false}
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
                error = {validation.lastNameError ? true : false}
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
                error = {validation.emailError ? true : false}
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
                error = {validation.passwordError ? true : false}
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
      <Box mt={5}>
        <Footer />
      </Box>
    </Container>
  );
}

export default Register;
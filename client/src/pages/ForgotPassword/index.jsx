import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
// See the note in LoginPage: variant is a MUI prop and did nothing on a bare
// router Link.
import MuiLink from "@mui/material/Link";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import API from "../../utils/AuthAPI";
import Alert from "../../components/Alerts";
import { validEmail } from "../../utils/ValidationHelpers";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const alertRef = useRef();

  const [formData, setFormData] = useState({
    email: "",
  });

  const [validation, setvalidation] = useState({
    emailError: null,
  });

  // Stays true after a success: the page navigates away, and re-enabling the
  // button first only invites another click on the way out.
  const [sending, setSending] = useState(false);

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

    return true;
  };

  const handleChange = (event) => {
    let { value, name } = event.currentTarget;
    setFormData({ ...formData, [name]: value });
    clearValidation();
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    let valid = validationCheck();

    // Nothing stopped a second submission while the first was still in the
    // air, and sending a reset email is rate limited to five an hour - so
    // impatient clicking spent the whole allowance on one request and locked
    // the user out of the only route back into their account.
    if (valid && !sending) {
      setSending(true);
      API.forgotPassword(formData)
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
          setSending(false);
          let data = err.response && err.response.data;

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
    if (validation.emailError !== null) {
      setvalidation({
        emailError: null,
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
              <MailOutlineIcon />
            </Avatar>
            <Typography component="h1" variant="h5">
              Forgot Password?
            </Typography>
            <Typography variant="body2" sx={{ mt: 2, textAlign: "center" }}>
              No worries! Just enter the email you used to register and we'll
              send you a reset password link.
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
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                onChange={handleChange}
                value={formData.email}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                color="primary"
                sx={{ mt: 3, mb: 2 }}
                disabled={sending}
              >
                {sending ? "Sending..." : "Send Email"}
              </Button>
              {/* One link, because there was only ever one destination. The
                  other said "Back Home" and pointed at "/", which
                  renders the login page - the same page this one goes to. Two
                  links, two labels, one place. */}
              <MuiLink component={Link} to="/login" variant="body2">
                Just remembered? Login
              </MuiLink>
            </Box>
          </Box>
        </Box>
      </Container>
    </div>
  );
};

export default ForgotPassword;

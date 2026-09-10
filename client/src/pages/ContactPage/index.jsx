import { useState, useRef } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";

import API from "../../utils/ContactAPI";
import Alert from "../../components/Alerts";
import { validEmail } from "../../utils/ValidationHelpers";
import { describeRequestError } from "../../utils/http";

// A way to reach us that does not require signing in.
//
// Which is the point of it. Everything else in this app is behind a login, and
// the person who most needs to get in touch is the one who cannot get in - a
// reset mail that never arrived, a token that expired, the wrong address on the
// account. A contact form behind requireAuth would be shut to exactly them, so
// this page and its route are public and the login page links to it.
//
// Shaped like ForgotPassword, which is the other public form: one field checked
// at a time, the button held while the request is in the air, and the answer
// shown here rather than by navigating away - somebody who has just typed four
// hundred words should not have them replaced by a different page.

// Matches the server's own check in routes/contact.js. Kept in step by being
// the same shape, not by being shared: the server may not trust anything this
// file does, so it validates again regardless.
const LIMITS = { name: 80, subject: 120, message: 4000 };

const EMPTY = { name: "", email: "", subject: "", message: "" };

const ContactPage = () => {
  const alertRef = useRef();

  const [form, setForm] = useState(EMPTY);
  const [fieldError, setFieldError] = useState({});
  const [sending, setSending] = useState(false);

  // The first fault only. The form marks one field at a time, and a list of
  // complaints about a message somebody has already typed once is not kinder
  // for being complete.
  const faultIn = () => {
    if (!form.name.trim()) return { name: "Please tell us your name" };
    if (!form.email.trim()) {
      return { email: "Please give us an address to reply to" };
    }
    if (!validEmail(form.email)) {
      return { email: "Please enter a valid email address" };
    }
    if (!form.message.trim()) {
      return { message: "Please tell us what you need help with" };
    }
    return null;
  };

  const handleChange = (event) => {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldError({});
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const fault = faultIn();
    if (fault) {
      setFieldError(fault);
      return;
    }

    // Nothing stopped a second submission while the first was in the air, and
    // this route allows five an hour - so impatient clicking would spend the
    // allowance on one message. The same trap ForgotPassword fell into.
    if (sending) return;

    setSending(true);
    API.send(form)
      .then((res) => {
        // Cleared on success, so a second question starts from an empty form
        // rather than the last one still sitting in it.
        setForm(EMPTY);
        alertRef.current.createAlert("success", res.data.message, true);
      })
      .catch((err) => {
        alertRef.current.createAlert("error", describeRequestError(err), true);
      })
      .finally(() => setSending(false));
  };

  return (
    <Container maxWidth="sm">
      <Typography variant="h5" component="h1" gutterBottom>
        Contact us
      </Typography>

      <Typography sx={{ color: "text.secondary", mb: 3 }}>
        Locked out, found a bug, or something not adding up? Send us a message
        and we will reply by email.
      </Typography>

      <Box
        sx={{
          boxShadow: 3,
          bgcolor: "background.paper",
          borderRadius: 1,
          p: { xs: 2.5, sm: 3.5 },
        }}
      >
        <Alert ref={alertRef} />

        {/* noValidate so the browser's own bubbles do not fight the messages
            below the fields, which say the same things in this app's words. */}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="contact-name"
            label="Your name"
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={handleChange}
            error={Boolean(fieldError.name)}
            helperText={fieldError.name || " "}
            slotProps={{ htmlInput: { maxLength: LIMITS.name } }}
          />

          <TextField
            margin="normal"
            required
            fullWidth
            id="contact-email"
            label="Your email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            error={Boolean(fieldError.email)}
            // Said rather than left to be inferred: this is the address the
            // reply goes to, and somebody locked out of one account may well
            // want to be answered at another.
            helperText={fieldError.email || "We will reply to this address"}
          />

          <TextField
            margin="normal"
            fullWidth
            id="contact-subject"
            label="Subject (optional)"
            name="subject"
            value={form.subject}
            onChange={handleChange}
            slotProps={{ htmlInput: { maxLength: LIMITS.subject } }}
          />

          <TextField
            margin="normal"
            required
            fullWidth
            multiline
            minRows={5}
            id="contact-message"
            label="How can we help?"
            name="message"
            value={form.message}
            onChange={handleChange}
            error={Boolean(fieldError.message)}
            helperText={fieldError.message || " "}
            slotProps={{ htmlInput: { maxLength: LIMITS.message } }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={sending}
            sx={{ mt: 2, mb: 1 }}
          >
            {sending ? "Sending..." : "Send message"}
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default ContactPage;

import { useState } from "react";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

// A password input with a show/hide toggle.
//
// MUI has no dedicated password component - a TextField with type="password"
// and an end adornment is the intended way, so this wraps that up once rather
// than repeating it on the four screens that ask for a password. Every other
// TextField prop passes straight through, so it drops in where one was.
const PasswordField = ({ label = "Password", ...props }) => {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      label={label}
      type={visible ? "text" : "password"}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                // The label changes with the state, so a screen reader
                // announces what the button will do rather than what it is.
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible((shown) => !shown)}
                // Without this the button takes focus from the field on
                // mousedown, and the caret jumps.
                onMouseDown={(event) => event.preventDefault()}
                edge="end"
              >
                {visible ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
};

export default PasswordField;

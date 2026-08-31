import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useLocation } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";

// Messages, as a toast in the bottom-left corner.
//
// These used to sit at the top of the page, inside the flow, which put a
// message about something you had just done somewhere you were not looking -
// saving your favourite team in Settings drew a green bar above the fold and
// nothing where you had clicked. A toast appears in the same place whatever
// triggered it.
//
// The interface is unchanged - createAlert(severity, message, show) through a
// ref - so the eight pages already using this got the new behaviour without
// being touched.

// An error stays long enough to be read twice; a confirmation does not need
// to. Neither blocks: both can be dismissed and both step aside on their own.
const DURATION = { error: 10000, warning: 10000, info: 6000, success: 5000 };

const Alerts = forwardRef((props, ref) => {
  const location = useLocation();

  const [alert, setAlert] = useState({
    type: "",
    message: "",
    show: false,
  });

  // Pages hand an alert over when they navigate here. react-router 6 dropped
  // arbitrary properties on the location object, so what used to arrive as
  // location.alert now travels in location.state.
  useEffect(() => {
    const passed = location.state && location.state.alert;

    if (passed) {
      setAlert({ type: passed.type, message: passed.message, show: true });
    }
  }, [location.state]);

  const createAlert = (severity, message, show) => {
    setAlert({ type: severity, message, show });
  };

  const clearAlert = () => setAlert((current) => ({ ...current, show: false }));

  useImperativeHandle(ref, () => ({ createAlert }));

  const severity = alert.type || "info";

  return (
    <Snackbar
      open={alert.show}
      autoHideDuration={DURATION[severity] || 6000}
      onClose={(event, reason) => {
        // Clicking elsewhere on the page is not a dismissal - it is somebody
        // getting on with what they were doing.
        if (reason === "clickaway") return;
        clearAlert();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Alert
        // MUI supplies an icon per severity, so success reads as a tick, a
        // failure as a warning mark and information as an i. That is the
        // distinction colour alone was being asked to carry.
        severity={severity}
        variant="outlined"
        onClose={clearAlert}
        // The outlined variant draws a border and leaves the background
        // transparent, which is fine for an alert sitting in the page and no
        // good for one floating over it - the text underneath showed straight
        // through. bgcolor puts a surface back behind it, and the shadow is
        // the same one every panel in the app uses, so it reads as sitting
        // above the page rather than punched into it.
        sx={{
          maxWidth: 420,
          bgcolor: "background.paper",
          boxShadow: 3,
        }}
      >
        {alert.message}
      </Alert>
    </Snackbar>
  );
});

export default Alerts;

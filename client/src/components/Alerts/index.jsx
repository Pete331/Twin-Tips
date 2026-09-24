import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useLocation } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { NAV_HEIGHT } from "../Navbar/height";

// Messages, as a toast at the top of the screen, just under the app bar.
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
//
// The top rather than the bottom-left corner it started in. At the bottom, a
// toast is drawn over whatever is pinned there: on a phone the navigation bar,
// and on the tips page, at every width, the tip bar. The tips page reports its
// mistakes this way ("You need to enter a margin for one of the games"), so
// the message about the fields covered the fields for the ten seconds an error
// stays up - measured at 768px, it sat squarely on the two picks. Clearing the
// bars instead would mean knowing their height, and the tip bar's changes
// whenever a team name wraps. Nothing under the app bar is pinned, and nothing
// an open keyboard can push the message behind, either.

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
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      // 8px under the bar, which is fixed and would otherwise be covered: MUI
      // puts a top toast 8px from the edge of the screen on a phone and 24px
      // from sm up, both inside the bar's 64px. Given per breakpoint for that
      // reason - MUI's sm rule is a media query, and a plain value here would
      // lose to it from sm up.
      sx={{ top: { xs: NAV_HEIGHT + 8, sm: NAV_HEIGHT + 8 } }}
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

import { Link, useLocation } from "react-router-dom";
import { useContext } from "react";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Paper from "@mui/material/Paper";
import HomeIcon from "@mui/icons-material/Home";
import ChecklistIcon from "@mui/icons-material/Checklist";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";

import { AuthContext } from "../../utils/AuthContext";

// The three destinations, along the bottom, on phones only.
//
// They used to live in a hamburger at the top right, which cost a tap to reach
// anything and hid where you were. They could not simply move onto the bar
// instead: measured, the three labels need 451px of a 375px viewport once the
// logo and the two icons are accounted for.
//
// A row of its own solves that - it has the full width to itself - and it is
// what the platform convention is for. This is a navigation bar rather than a
// bottom app bar, which is a different thing: a bottom app bar holds actions
// for the screen you are on and tracks nothing. These are destinations, and
// the point is that the current one is lit.
//
// The height of the bar, so the page can reserve the same amount below its
// content. Matches BottomNavigation's own default rather than setting one.
export const BOTTOM_NAV_HEIGHT = 56;

// Icons because a navigation bar of bare words reads as a list rather than a
// bar - and labels too, because a checklist is not self-evidently "tip now"
// to someone who has never seen it.
const DESTINATIONS = [
  { to: "/Home", label: "Home", icon: <HomeIcon /> },
  { to: "/TipsPage", label: "Tip now", icon: <ChecklistIcon /> },
  { to: "/Leaderboard", label: "Leaderboard", icon: <LeaderboardIcon /> },
];

const BottomNav = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();

  // Nothing to navigate to while signed out - every destination here needs an
  // account, and the login screen is not improved by a bar of dead ends.
  if (!user.isAuthenticated) return null;

  // Lowercased on both sides, as elsewhere: react-router matches paths without
  // regard to case, so the address bar can read /home while this says /Home.
  const here = location.pathname.toLowerCase();
  const match = DESTINATIONS.find(
    (d) => here === d.to.toLowerCase() || here.startsWith(`${d.to.toLowerCase()}/`)
  );

  return (
    <Paper
      elevation={3}
      sx={{
        display: { xs: "block", sm: "none" },
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        // Above the page, below a modal. Borrowed from the theme rather than
        // guessed, so it stays right if the scale ever changes.
        zIndex: (theme) => theme.zIndex.appBar,
        // The home indicator on a modern iPhone sits over the bottom of the
        // screen. Without this the last few pixels of the bar - and the labels
        // with them - are underneath it.
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <BottomNavigation
        // false, not undefined, when you are somewhere else - the profile page,
        // the rules, a league's own page. undefined leaves MUI to decide and it
        // lights the first item, which would say Home while you are not on it.
        value={match ? match.to : false}
        showLabels
      >
        {DESTINATIONS.map((d) => (
          <BottomNavigationAction
            key={d.to}
            component={Link}
            to={d.to}
            value={d.to}
            label={d.label}
            icon={d.icon}
            // The lit state is the visible half; this is the half a screen
            // reader gets.
            aria-current={match && match.to === d.to ? "page" : undefined}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
};

export default BottomNav;

import { Box, Button, IconButton, Tooltip } from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import AccountMenu from "./AccountMenu";
import { Link, useLocation } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";

// Three places to go, and two icons for everything else.
//
// The bar carried seven items - Home, Tip now, Leaderboard, Leagues, Rules,
// Settings, Logout - which is more than a tipping app with four screens needs
// and made the row itself look like the complicated part.
//
// What went where:
//   Leagues   - the leaderboard is the league view, and its picker is now the
//               page title, so a separate destination was a longer way to the
//               same table. Creating and joining moved under it.
//   Rules     - the question mark.
//   Settings  - the account menu, with Logout, where both belong.
//
// On a phone the three are along the bottom instead - see BottomNav. The
// hamburger that used to hold them is gone with it: it opened a menu of
// exactly those three, so once they have a row of their own it was a tap to
// reach a tap. What is left up here on a phone is the logo, help, and you.
const LINKS = [
  { to: "/Home", label: "Home", signedIn: true },
  { to: "/TipsPage", label: "Tip now", signedIn: true },
  { to: "/Leaderboard", label: "Leaderboard", signedIn: true },
];

const AppBarCollapse = () => {
  const { logout, user } = useContext(AuthContext);
  const location = useLocation();

  // Lowercased on both sides, because react-router matches paths without
  // regard to case - the address bar can read /leagues while the link here
  // says /Leagues.
  //
  // The prefix test is what keeps Leagues marked while you are inside one at
  // /leagues/<slug>.
  const isHere = (to) => {
    const here = location.pathname.toLowerCase();
    const target = to.toLowerCase();
    return here === target || here.startsWith(`${target}/`);
  };

  const visible = LINKS.filter((link) => !link.signedIn || user.isAuthenticated);

  // Kept out of the menus and always on the bar, signed in or not. The rules
  // page explains the two league types and how scoring works, which is most
  // useful to someone deciding whether to join at all - so it has to be
  // reachable before there is an account to hang it off.
  const help = (
    <Tooltip title="How to play">
      <IconButton
        component={Link}
        to="/rulespage"
        aria-label="How to play"
        aria-current={isHere("/rulespage") ? "page" : undefined}
        sx={{ color: "inherit" }}
      >
        <HelpOutlineIcon />
      </IconButton>
    </Tooltip>
  );

  return (
    // Pushed to the end of the toolbar rather than pinned to its right edge.
    //
    // This was position:absolute right:0, which is positioned against the
    // AppBar and so sat outside the Toolbar's own gutters - the reason the
    // last item used to touch the edge of the screen. As a flex item with an
    // auto margin it lands inside the padding like everything else, and the
    // gap below is what spaces the row instead of margins on each control.
    <Box
      sx={{
        ml: "auto",
        display: "flex",
        alignItems: "center",
        gap: 0.5,
      }}
    >

      <Box
        id="appbar-collapse"
        sx={{
          // Hidden below sm, shown from sm up. Written as down("xs") under
          // Material-UI v4 this meant "narrower than 600px"; from v5 the scale
          // starts at xs = 0, so it means "narrower than nothing" and never
          // matched - the row of links never hid, and on a phone it was drawn
          // across the header beside the hamburger that had correctly
          // appeared.
          display: { xs: "none", sm: "flex" },
          alignItems: "center",
          background: "transparent",
          // The theme colours bare anchors with the primary colour, which
          // lands on the anchors wrapping these buttons and reads as muted
          // grey against the navy. Inheriting reconnects them to the bar.
          //
          // Scoped to this bar on purpose: the same links inside the mobile
          // menu sit on a white surface, where the theme colour is correct.
          "& a": { color: "inherit" },
        }}
      >
        {visible.map((link) => (
          <Link key={link.to} to={link.to}>
            <Button
              color="inherit"
              aria-current={isHere(link.to) ? "page" : undefined}
              // An underline rather than a filled background: the bar is one
              // solid navy, and a pill on it reads as a button waiting to be
              // pressed rather than as where you already are. The transparent
              // border on the others keeps the row from shifting by 2px as
              // you move between pages.
              sx={{
                borderRadius: 0,
                borderBottom: "2px solid",
                borderColor: isHere(link.to) ? "currentColor" : "transparent",
                fontWeight: isHere(link.to) ? 700 : undefined,
              }}
            >
              {link.label}
            </Button>
          </Link>
        ))}
      </Box>

      {help}

      {user.isAuthenticated ? (
        <AccountMenu user={user} onLogout={logout} />
      ) : (
        <Link to="/login" style={{ color: "inherit" }}>
          <Button color="inherit">Login</Button>
        </Link>
      )}
    </Box>
  );
};

export default AppBarCollapse;

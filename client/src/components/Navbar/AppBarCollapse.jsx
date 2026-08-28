import { Button, MenuItem } from "@mui/material";
import { withStyles } from '../../utils/muiStyles';
import ButtonAppBarCollapse from "./ButtonAppBarCollapse";
import { Link, useLocation } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";

const styles = (theme) => ({
  root: {
    position: "absolute",
    right: 0,
  },
  buttonBar: {
    // down("sm"), not down("xs"). In Material-UI v4, xs was the smallest named
    // width and down("xs") meant "narrower than 600px". From v5 the scale
    // starts at xs = 0, so down("xs") means "narrower than nothing" and never
    // matches - the row of links never hid, and on a phone it was drawn across
    // the header next to the hamburger that had correctly appeared. Both now
    // switch at the same 600px boundary.
    [theme.breakpoints.down("sm")]: {
      display: "none",
    },
    margin: "10px",
    paddingLeft: "16px",
    right: 0,
    position: "relative",
    width: "100%",
    background: "transparent",
    // The theme colours bare anchors with the primary colour, which lands on
    // the anchors wrapping these buttons and reads as muted grey against the
    // navy. Inheriting reconnects them to the bar.
    //
    // Scoped to this bar on purpose: the same links inside the mobile menu sit
    // on a white surface, where the theme colour is correct.
    "& a": {
      color: "inherit",
    },
  },
});

// One list, rendered twice - as buttons on a wide screen, as menu items on a
// narrow one. It used to be written out twice with six conditionals on each
// side, which is how the two came to differ in small ways.
const LINKS = [
  { to: "/Dashboard", label: "Dashboard", signedIn: true },
  { to: "/TipsPage", label: "Tip Now", signedIn: true },
  { to: "/Leaderboard", label: "Leaderboard", signedIn: true },
  { to: "/Leagues", label: "Leagues", signedIn: true },
  { to: "/RulesPage", label: "Rules", signedIn: false },
  { to: "/Settings", label: "Settings", signedIn: true },
];

const AppBarCollapse = (props) => {
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

  return (
    <div className={props.classes.root}>
      <ButtonAppBarCollapse>
        {visible.map((link) => (
          <MenuItem
            key={link.to}
            selected={isHere(link.to)}
            // The highlight is the visible half. aria-current is the half a
            // screen reader gets, and without it the current page would be
            // signalled by appearance alone.
            aria-current={isHere(link.to) ? "page" : undefined}
          >
            <Link to={link.to}>{link.label}</Link>
          </MenuItem>
        ))}
        {user.isAuthenticated ? (
          <MenuItem>
            <Link to="/" onClick={logout}>
              Logout
            </Link>
          </MenuItem>
        ) : null}
      </ButtonAppBarCollapse>

      <div className={props.classes.buttonBar} id="appbar-collapse">
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
        {user.isAuthenticated ? (
          <Link to="/" onClick={logout}>
            <Button color="inherit">Logout</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
};

export default withStyles(styles)(AppBarCollapse);

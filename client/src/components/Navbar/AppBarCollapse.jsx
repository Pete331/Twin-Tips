import { Button, MenuItem } from "@mui/material";
import { withStyles } from '../../utils/muiStyles';
import ButtonAppBarCollapse from "./ButtonAppBarCollapse";
import { Link } from "react-router-dom";
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
    // global.css sets `a { color: #3f51b5 }`, which lands on the anchors
    // wrapping these buttons. The buttons are color="inherit", so they took
    // that indigo instead of the AppBar's white and read as muted grey
    // against the navy. Inheriting here reconnects them to the bar.
    //
    // Scoped to this bar on purpose: the same links inside the mobile menu
    // sit on a white surface, where the indigo is correct.
    "& a": {
      color: "inherit",
    },
  },
});

const AppBarCollapse = (props) => {
  const { logout, user } = useContext(AuthContext);
  return (
    <div className={props.classes.root}>
      <ButtonAppBarCollapse>
        {user.isAuthenticated ? (
          <MenuItem>
            <Link to="/Dashboard">Dashboard</Link>
          </MenuItem>
        ) : null}
        {user.isAuthenticated ? (
          <MenuItem>
            <Link to="/TipsPage">Tip Now</Link>
          </MenuItem>
        ) : null}
        {user.isAuthenticated ? (
          <MenuItem>
            <Link to="/Leaderboard">Leaderboard</Link>
          </MenuItem>
        ) : null}
        {user.isAuthenticated ? (
          <MenuItem>
            <Link to="/Leagues">Leagues</Link>
          </MenuItem>
        ) : null}
        <MenuItem>
          <Link to="/RulesPage">Rules</Link>
        </MenuItem>
        {user.isAuthenticated ? (
          <MenuItem>
            <Link to="/Settings">Settings</Link>
          </MenuItem>
        ) : null}
        {user.isAuthenticated ? (
          <MenuItem>
            <Link to="/" onClick={logout}>
              Logout
            </Link>
          </MenuItem>
        ) : null}
      </ButtonAppBarCollapse>
      <div className={props.classes.buttonBar} id="appbar-collapse">
        {user.isAuthenticated ? (
          <Link to="/Dashboard">
            <Button color="inherit">Dashboard</Button>
          </Link>
        ) : null}
        {user.isAuthenticated ? (
          <Link to="/TipsPage">
            <Button color="inherit">Tip Now</Button>
          </Link>
        ) : null}
        {user.isAuthenticated ? (
          <Link to="/Leaderboard">
            <Button color="inherit">Leaderboard</Button>
          </Link>
        ) : null}
        {user.isAuthenticated ? (
          <Link to="/Leagues">
            <Button color="inherit">Leagues</Button>
          </Link>
        ) : null}
        <Link to="/RulesPage">
          <Button color="inherit">Rules</Button>
        </Link>
        {user.isAuthenticated ? (
          <Link to="/Settings">
            <Button color="inherit">Settings</Button>
          </Link>
        ) : null}
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

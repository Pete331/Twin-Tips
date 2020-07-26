import { Button, MenuItem } from "@material-ui/core";
import { withStyles } from "@material-ui/core/styles";
import ButtonAppBarCollapse from "./ButtonAppBarCollapse";
import { Link } from "react-router-dom";
import React, { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";

const styles = (theme) => ({
  root: {
    position: "absolute",
    right: 0,
  },
  buttonBar: {
    [theme.breakpoints.down("xs")]: {
      display: "none",
    },
    margin: "10px",
    paddingLeft: "16px",
    right: 0,
    position: "relative",
    width: "100%",
    background: "transparent",
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
          <Button color="inherit">
            <Link to="/Dashboard">Dashboard</Link>
          </Button>
        ) : null}
        {user.isAuthenticated ? (
          <Button color="inherit">
            <Link to="/TipsPage">Tip Now</Link>
          </Button>
        ) : null}
        <Button color="inherit">
          <Link to="/RulesPage">Rules</Link>
        </Button>
        {user.isAuthenticated ? (
          <Button color="inherit">
            <Link to="/Settings">Settings</Link>
          </Button>
        ) : null}
        {user.isAuthenticated ? (
          <Button color="inherit">
            <Link to="/" onClick={logout}>
              Logout
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default withStyles(styles)(AppBarCollapse);

import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import AppBarCollapse from "./AppBarCollapse";

const styles = {
  root: {
    flexGrow: 1,
  },
  grow: {
    flexGrow: 1,
  },
  menuButton: {
    marginLeft: -12,
    marginRight: 20,
  },
  navigation: {},
  toggleDrawer: {},
  appTitle: {},
};

const Navbar = (props) => {
  const { classes } = props;

  return (
    <nav>
      <AppBar position="fixed" className={classes.navigation} style={{ background: '#003b91' }}>
        <Toolbar>
          <a href="/">
            <img
              src="./assets/logo.png"
              alt="Twin-tips logo"
              width="150"
              height="auto"
              align='center'
            ></img>
          </a>
          <AppBarCollapse />
        </Toolbar>
      </AppBar>
    </nav>
  );
};

Navbar.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(Navbar);

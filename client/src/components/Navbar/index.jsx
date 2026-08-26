import PropTypes from "prop-types";
import { useContext } from "react";
import { Link } from "react-router-dom";
import { withStyles } from '../../utils/muiStyles';
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import AppBarCollapse from "./AppBarCollapse";
import { AuthContext } from "../../utils/AuthContext";

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
  const { user } = useContext(AuthContext);

  return (
    <nav>
      <AppBar position="fixed" className={classes.navigation} style={{ background: '#003b91' }}>
        <Toolbar>
          {/* The logo goes to the dashboard when there is someone to show it
              to, and to the sign-in page otherwise. It used to be a plain
              anchor to "/", which is the login screen - so clicking the logo
              while signed in took you to a login form you did not need, and
              did it with a full page reload rather than a route change. */}
          <Link to={user.isAuthenticated ? "/dashboard" : "/login"}>
            <img
              src="/assets/logo.png"
              alt="Twin-tips logo"
              width="150"
              height="auto"
              align='center'
            ></img>
          </Link>
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

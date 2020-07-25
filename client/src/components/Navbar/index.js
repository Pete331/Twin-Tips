import React, { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { Link } from "react-router-dom";

const Navbar = () => {
  const { logout, user } = useContext(AuthContext);
  return (
    <nav>
      <div className="nav-wrapper" style={{ backgroundColor: "deepskyblue" }}>
        <a href="/">
          <img
          className="hide-on-small-only"
            src="./assets/logo.png"
            alt="Twin-tips logo"
            width="125"
            height="auto"
          ></img>
        </a>

        <ul id="nav-mobile" className="right">
          <li>
            {user.isAuthenticated ? (
              <Link to="/Dashboard">Dashboard</Link>
            ) : null}
          </li>
          <li>
            <Link to="/RulesPage">Rules</Link>
          </li>
          <li>
            {user.isAuthenticated ? <Link to="/TipsPage">Tip Now</Link> : null}
          </li>
          <li>
            {user.isAuthenticated ? <Link to="/Settings">Settings</Link> : null}
          </li>
          <li>
            {user.isAuthenticated ? (
              <Link to="/" onClick={logout}>
                Logout
              </Link>
            ) : null}
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;

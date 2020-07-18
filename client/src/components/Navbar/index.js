import React, { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { Link } from "react-router-dom";

const Navbar = () => {
  const { logout } = useContext(AuthContext);
  return (
    <nav>
      <div className="nav-wrapper" style={{ backgroundColor: "deepskyblue" }}>
        <a href="/" className="brand-logo">
          Twin Tips
        </a>
        <ul id="nav-mobile" className="right hide-on-med-and-down">
          <li>
            <Link to="/Dashboard">Rules</Link>
          </li>
          <li>
            <Link to="/TipsPage">Tip Now</Link>
          </li>
          <li>
            <Link to="/" onClick={logout}>Logout</Link>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;

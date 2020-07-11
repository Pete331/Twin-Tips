import React from "react";
import { Link } from "react-router-dom";

function Navigation() {
  return (
    <header>
      Header
      <Link className="btn nav-link text-muted" to="/Tip">
        Tip Now
      </Link>
    </header>
  );
}

export default Navigation;

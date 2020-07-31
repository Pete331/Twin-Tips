import React from "react";
import Typography from "@material-ui/core/Typography";
import { Link } from "react-router-dom";
import Box from "@material-ui/core/Box";

const Footer = () => {
  return (
    <footer className="footer"
      align="center"
      style={{
        backgroundColor: "#003b91",
        height: "50px",
      }}
    >
      <Box p={1.5}>
        <Typography variant="body1" style={{ color: "white" }}>
          {"Copyright © "}
          <Link to="/" style={{ color: "white" }}>
            Twin Tips
          </Link>
          {` ${new Date().getFullYear()}.`}
        </Typography>
      </Box>
    </footer>
  );
};

export default Footer;

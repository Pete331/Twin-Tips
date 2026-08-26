import Typography from "@mui/material/Typography";
import { Link } from "react-router-dom";
import Box from "@mui/material/Box";
import { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";

const Footer = () => {
  // Same rule as the logo in the header: the dashboard when there is someone
  // to show it to, the sign-in page otherwise. Both pointed at "/" regardless,
  // which is the login screen - so it sent signed-in users to a form they had
  // already filled in.
  const { user } = useContext(AuthContext);

  return (
    <footer className="footer"
      align="center"
      style={{
        backgroundColor: "#003b91",
        height: "50px",
      }}
    >
      <Box sx={{
        p: 1.5
      }}>
        <Typography variant="body1" style={{ color: "white" }}>
          {"Copyright © "}
          <Link
            to={user.isAuthenticated ? "/dashboard" : "/login"}
            style={{ color: "white" }}
          >
            Twin Tips
          </Link>
          {` ${new Date().getFullYear()}.`}
        </Typography>
      </Box>
    </footer>
  );
};

export default Footer;

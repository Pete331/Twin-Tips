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
    // No className and no fixed height. The footer used to be pinned to the
    // bottom with position:absolute and a hard 50px height, which the page
    // above had to reserve room for with a matching padding - two numbers to
    // keep in step. It is now simply the last item in the app's column and
    // sits wherever its content ends.
    <Box
      component="footer"
      sx={{
        backgroundColor: "#003b91",
        color: "common.white",
        textAlign: "center",
        // Taller than it was. At p: 1.5 the text sat close enough to both
        // edges that the bar read as a rule under the content rather than as
        // a footer. Horizontal padding matters less with the text centred,
        // but it keeps the line off the edges on a narrow screen where it
        // wraps.
        py: 2.5,
        px: { xs: 2, sm: 3 },
      }}
    >
      <Typography variant="body1">
        {"Copyright © "}
        <Link
          to={user.isAuthenticated ? "/dashboard" : "/login"}
          style={{ color: "inherit" }}
        >
          Twin Tips
        </Link>
        {` ${new Date().getFullYear()}.`}
      </Typography>
    </Box>
  );
};

export default Footer;

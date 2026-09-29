import Typography from "@mui/material/Typography";
import { Link } from "react-router-dom";
import Box from "@mui/material/Box";
import { useContext } from "react";
import { AuthContext } from "../../utils/AuthContext";
import { touchLink } from "../../theme";

// Inherits the bar's white. 44px tall on a touch screen: they were 19 (UX audit
// finding #32).
const footerLink = { color: "inherit", ...touchLink };

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
        // The bar's own height, back where it was. The space that was wanted
        // is above the footer, not inside it - that lives on the main element
        // in App, so every page gets it and the bar stays the size it was.
        p: 1.5,
      }}
    >
      <Typography variant="body1">
        {"Copyright © "}
        <Box
          component={Link}
          to={user.isAuthenticated ? "/home" : "/login"}
          sx={footerLink}
        >
          Twin Tips
        </Box>
        {` ${new Date().getFullYear()}.`}
        {" · "}
        {/* On every page, signed in or not. Until now the app had no way at
            all to reach us, which mattered in exactly one case: somebody
            locked out, who cannot use anything behind the login. */}
        <Box component={Link} to="/contact" sx={footerLink}>
          Contact us
        </Box>
      </Typography>
    </Box>
  );
};

export default Footer;

import { useContext } from "react";
import { Link } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import AppBarCollapse from "./AppBarCollapse";
import { AuthContext } from "../../utils/AuthContext";

// The height of the bar, and of the space kept for it below. One constant for
// both, because they have to agree: a fixed AppBar is out of the document's
// flow, so whatever it covers has to be given back explicitly.
//
// Change this and the logo cap together if the bar should be taller.
const NAV_HEIGHT = 64;
const LOGO_HEIGHT = 44;

const Navbar = () => {
  const { user } = useContext(AuthContext);

  return (
    <nav>
      <AppBar position="fixed" style={{ background: '#003b91' }}>
        {/* The logo is 150x77 at full size, which pushed the bar to 77px - past
            the 64px a toolbar is meant to be - so anything sized against a
            normal toolbar came up short. Capping its height keeps the bar a
            predictable size and the logo in proportion to it. */}
        {/* More gutter than a Toolbar's default 16/24px. The logo sat almost
            against the left edge and "Logout" against the right, which reads
            as the bar having run out of room rather than as a deliberate
            edge. Scaled by breakpoint so a phone does not give up width it
            cannot spare. */}
        <Toolbar
          sx={{
            minHeight: NAV_HEIGHT,
            height: NAV_HEIGHT,
            px: { xs: 2, sm: 3, md: 4 },
          }}
        >
          {/* The logo goes to the dashboard when there is someone to show it
              to, and to the sign-in page otherwise. It used to be a plain
              anchor to "/", which is the login screen - so clicking the logo
              while signed in took you to a login form you did not need, and
              did it with a full page reload rather than a route change. */}
          <Link to={user.isAuthenticated ? "/home" : "/login"}>
            {/* SVG rather than the old 507x259 bitmap: the mark is three
                ellipses and four letters, so it scales instead of softening on
                a retina screen, and it carries its own font so it cannot
                render in the wrong face. See scripts/buildLogo.js. */}
            <img
              src="/assets/logo.svg"
              alt="Twin Tips"
              style={{ height: LOGO_HEIGHT, width: "auto", display: "block" }}
            />
          </Link>
          <AppBarCollapse />
        </Toolbar>
      </AppBar>

      {/* The space the fixed bar occupies. Without it every page started at the
          top of the window and ran underneath the header - 55px of each signed
          in page was covered. The sign-in screen looked almost right only by
          accident: its card carries a 64px top margin which collapsed upward
          and happened to stand in for this. */}
      <Box sx={{ height: NAV_HEIGHT }} />
    </nav>
  );
};

export default Navbar;

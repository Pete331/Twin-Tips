import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "../../pages/LoginPage";
import RegisterPage from "../../pages/RegisterPage";
import Dashboard from "../../pages/DashboardPage";
import NotFoundPage from "../../pages/NotFoundPage";
import PrivateRoute from "../../utils/PrivateRoute";
import ForgotPassword from "../../pages/ForgotPassword";
import ResetPassword from "../../pages/ResetPassword";
// @fontsource/roboto splits the family by weight and by unicode subset rather
// than shipping it whole, so ask for just the four weights MUI's default
// typography uses, in latin and latin-ext. The other subsets are @font-face
// blocks for alphabets this app never renders: the browser would never fetch
// the font files, but the declarations still cost CSS on every page load.
import "@fontsource/roboto/latin-300.css";
import "@fontsource/roboto/latin-ext-300.css";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-ext-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-ext-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-ext-700.css";
import Box from "@mui/material/Box";
import Navbar from "../../components/Navbar";
import TimeTravelBanner from "../../components/TimeTravelBanner";
import Footer from "../../components/Footer";
import TipsPage from "../../pages/TipsPage";
import RulesPage from "../../pages/RulesPage";
import SettingsPage from "../../pages/SettingsPage";
import Leaderboard from "../../pages/Leaderboard";

function App() {
  return (
    // A column that fills the window: header, then the page taking whatever
    // room is left, then the footer. That is the whole layout.
    //
    // It used to be done by pinning the footer with position:absolute and
    // reserving room for it with a 70px padding on #root that had to be kept
    // in step with the footer's height by hand. Along with it came
    // overflow:hidden on #root, which silently disables position:sticky
    // anywhere inside the app - a trap for whoever reaches for a sticky table
    // header later. flex-grow needs no magic number and nothing to keep in
    // step.
    // 100dvh, not 100vh. On a phone, 100vh is the viewport with the browser
    // chrome hidden - the largest it ever gets - so the column was taller than
    // what you could actually see and the footer sat below the fold, with the
    // gap above it that flex-grow had opened. dvh tracks the visible height,
    // so the footer lands on the bottom edge of the screen instead.
    //
    // 100vh stays as the fallback for anything without dvh support.
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        "@supports (min-height: 100dvh)": { minHeight: "100dvh" },
      }}
    >
      <BrowserRouter>
        <Navbar />
        {/* Below the header rather than above it, so it does not fight the
            fixed AppBar for the top of the page. Renders nothing unless the
            server says a clock override is running, which it can only do on a
            development machine. */}
        <TimeTravelBanner />
        {/* The gap above and below the page's content - between it and the
            header, and between it and the footer. Both belong here rather
            than on the bars: padding inside a bar only makes the bar taller,
            and a margin on each page would mean remembering it on the next
            one. Every page gets both, and pages that carry their own margin
            keep it on top.

            pt is smaller than pb because the header already ends in a solid
            edge, while the footer needs the content to have visibly finished
            before it starts. */}
        <Box component="main" sx={{ flexGrow: 1, pt: 3, pb: 4 }}>
        {/* react-router 7: Switch is Routes, routes take an element rather
            than a component, and paths match exactly by default so "exact" is
            gone. PrivateRoute wraps the element instead of standing in for
            Route, which is the v6+ pattern. */}
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/rulespage" element={<RulesPage />} />
          <Route path="/reset/:token" element={<ResetPassword />} />
          <Route
            path="/tipspage"
            element={
              <PrivateRoute>
                <TipsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <PrivateRoute>
                <Leaderboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Box>
        <Footer />
      </BrowserRouter>
    </Box>
  );
}

export default App;

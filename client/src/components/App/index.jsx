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
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <BrowserRouter>
        <Navbar />
        <Box component="main" sx={{ flexGrow: 1 }}>
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

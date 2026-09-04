import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import LoginPage from "../../pages/LoginPage";
import PrivateRoute from "../../utils/PrivateRoute";
import Loader from "../Loader";
// Latin only, and three weights.
//
// These subset files declare Roboto across the whole of unicode with no
// unicode-range, so a latin and a latin-ext import at the same weight are two
// @font-face rules the browser cannot tell apart - and measured on the built
// app it fetched both: roboto-latin-400 at 22kB and roboto-latin-ext-400 at
// 15kB, then both again for weight 500. 74kB of font doing 44kB of work.
//
// Dropping latin-ext is the cheap half of that. @fontsource does ship a
// properly subsetted 400.css with a unicode-range per alphabet, which would
// load latin-ext only when something needs it - but it declares nine subsets
// per weight, and measured, that took the stylesheet from 1.77kB to 34.9kB
// (0.34kB to 16.8kB gzipped). CSS blocks rendering and fonts do not, so that
// trade trades the wrong way round.
//
// What it costs: a character outside basic latin - an accent in somebody's name
// - falls back to Helvetica for that glyph. Worth 30kB.
//
// Three weights, not four. MUI's defaults reach for 300 on h1 and h2 and this
// app uses neither; measured on the built app, weight 300 was declared and
// never loaded.
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import Box from "@mui/material/Box";
import Navbar from "../../components/Navbar";
import TimeTravelBanner from "../../components/TimeTravelBanner";
import Footer from "../../components/Footer";
import BottomNav, { BOTTOM_NAV_HEIGHT } from "../../components/BottomNav";

// Every page but the login screen is fetched when it is first opened.
//
// The app shipped as one 714KB file, so a visitor downloaded the
// leaderboard, the leagues pages and settings before the tips page they
// came for could paint. Splitting them out means the first load carries
// what is on screen and the rest arrives as it is asked for.
//
// LoginPage is deliberately not in here. It is where a signed-out visitor
// lands, so deferring it would add a round trip to the first thing anyone
// sees - the opposite of the point.
const RegisterPage = lazy(() => import("../../pages/RegisterPage"));
const Home = lazy(() => import("../../pages/HomePage"));
const LeaguePage = lazy(() => import("../../pages/LeaguePage"));
const JoinLeague = lazy(() => import("../../pages/JoinLeague"));
const NotFoundPage = lazy(() => import("../../pages/NotFoundPage"));
const ForgotPassword = lazy(() => import("../../pages/ForgotPassword"));
const ResetPassword = lazy(() => import("../../pages/ResetPassword"));
const TipsPage = lazy(() => import("../../pages/TipsPage"));
const RulesPage = lazy(() => import("../../pages/RulesPage"));
const SettingsPage = lazy(() => import("../../pages/SettingsPage"));
const Leaderboard = lazy(() => import("../../pages/Leaderboard"));

function App() {
  // Fetches the two pages everyone opens, once the browser has nothing else to
  // do.
  //
  // Splitting the routes made the first paint smaller and gave the first visit
  // to each page a chunk to wait for - measured at 81KB for the tips page,
  // which is nothing locally and a pause on exactly the connections this was
  // done for. On its own that trades one delay for another.
  //
  // Warming them on idle keeps both halves: the first paint carries only what
  // is on screen, and by the time anyone clicks through, the chunk is already
  // in the module cache and the navigation is instant. It runs after first
  // paint and yields to anything more important, so nothing visible waits.
  //
  // Only these two. Everything else is rare enough that fetching it up front
  // would be the old single bundle wearing a disguise.
  useEffect(() => {
    const warm = () => {
      import("../../pages/HomePage");
      import("../../pages/TipsPage");
    };

    // requestIdleCallback is not in every browser this has to run in; a plain
    // timeout is the same idea with worse timing.
    const idle = "requestIdleCallback" in window;
    const handle = idle
      ? window.requestIdleCallback(warm, { timeout: 4000 })
      : window.setTimeout(warm, 2500);

    return () => {
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

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
        // Room for the fixed navigation bar, plus the phone's own
        // home-indicator inset.
        //
        // On the column rather than on main, which was the first attempt and
        // left the footer underneath the bar: the footer is main's sibling, so
        // padding on main never reached it. Measured - the footer's bottom edge
        // sat 56px past the top of the bar. Here it covers everything the
        // column holds.
        pb: {
          xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
          sm: 0,
        },
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
        {/* One boundary around the routes rather than one per page. A
            chunk that has already been fetched resolves without ever
            suspending, so this only shows on the first visit to a page -
            and it is the spinner rather than a skeleton for the same
            reason PrivateRoute uses one: no page has been chosen yet, so
            there is no layout to hold open. */}
        <Suspense fallback={<Loader />}>
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
          {/* The Leagues page is gone. It listed the leagues you are in,
              which is what the leaderboard's own picker does, and held the
              join and create forms, which now sit under that table - so it
              was a page whose whole job was pointing at another one. The
              path stays as a redirect, for bookmarks and for anyone who
              followed an invite link before this changed. */}
          <Route path="/leagues" element={<Navigate to="/leaderboard" replace />} />
          <Route
            path="/leagues/:slug"
            element={
              <PrivateRoute>
                <LeaguePage />
              </PrivateRoute>
            }
          />
          {/* Where an invite link lands. Behind PrivateRoute like the rest, so
              someone not signed in is sent to sign in and returned here - the
              token is in the URL rather than a form so it survives that. */}
          <Route
            path="/join/:token"
            element={
              <PrivateRoute>
                <JoinLeague />
              </PrivateRoute>
            }
          />
          <Route
            path="/home"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />
          {/* The address this page lived at for the whole of last season, so
              anyone who bookmarked it or was sent a link still arrives.
              replace, so the old path does not sit in the history behind the
              new one and come back on a press of the back button. */}
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
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
        </Suspense>
        </Box>
        <Footer />
        {/* After the footer in the markup and fixed over it on screen, so it
            comes last in the tab order rather than sitting between the page
            and its footer. */}
        <BottomNav />
      </BrowserRouter>
    </Box>
  );
}

export default App;

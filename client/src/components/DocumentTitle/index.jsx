import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// What the browser tab says.
//
// It said "Twin Tips" on every page. Ten tabs were indistinguishable, browser
// history and bookmarks were a list of the same word, and - the part that is
// not cosmetic - a screen reader announces the document title when it changes,
// so moving between pages was never announced at all. In a single-page app
// there is no page load to notice instead.
//
// One component rather than a hook called from each page: every title here is a
// property of the route, nothing needs to compute one, and a hook in ten files
// is ten places to forget. A page that later wants something richer - the round
// number, a league's name - can set document.title itself in an effect and this
// will not fight it, because this only runs when the path changes.
//
// Keyed on the first segment, which is enough to tell every route apart and
// means /leagues/the-rivals and /reset/<token> need no pattern matching.
const TITLES = {
  "": "Sign in",
  login: "Sign in",
  register: "Register",
  forgot: "Forgot password",
  reset: "Reset password",
  rulespage: "How to play",
  contact: "Contact us",
  home: "Home",
  tipspage: "Tip now",
  leaderboard: "Leaderboard",
  leagues: "League",
  join: "Join a league",
  settings: "Profile",
};

const SITE = "Twin Tips";

// Matching the heading on the page where there is one - Profile, How to play,
// Contact us - so the tab and the page agree about where you are.
export const titleFor = (pathname) => {
  // Lowercased because the navigation used to link to /Home and /TipsPage, and
  // a bookmark from then still arrives that way.
  const first = String(pathname || "").toLowerCase().split("/")[1] || "";
  const page = Object.prototype.hasOwnProperty.call(TITLES, first)
    ? TITLES[first]
    : "Page not found";

  // The site name last. A tab strip crops from the right, so the part that
  // tells two tabs apart has to come first.
  return `${page} · ${SITE}`;
};

const DocumentTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);

  return null;
};

export default DocumentTitle;

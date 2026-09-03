import { useEffect, useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "../utils/AuthContext";
import Loader from "../components/Loader";
import API from "./AuthAPI";

// A wrapper around the element being protected, rather than a stand-in for
// Route. react-router 6 dropped the render-prop form this used to rely on, and
// a route now takes an element, so guarding happens by wrapping that element:
//
//   <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
function PrivateRoute({ children }) {
  const { user, setUser, checked } = useContext(AuthContext);
  const location = useLocation();

  useEffect(() => {
    API.checkAuthState()
      .then((res) => {
        let { user, id, admin, isAuthenticated, firstName, lastName } = res.data;

        setUser({
          isAuthenticated: isAuthenticated,
          name: user,
          id: id,
          admin: admin,
          // For the avatar's initials. name is the username, which is one
          // word and gives no way to tell a first name from a last.
          firstName,
          lastName,
        });

      })
      .catch((err) => {
        setUser({
          isAuthenticated: false,
          name: null,
          id: null,
          admin: false,
        });
        console.log(err);
      });
  }, [setUser]);

  // Blocks only when there is nothing to go on.
  //
  // Each route wraps its own PrivateRoute, so moving between pages mounts a
  // new one and used to put a fresh auth round trip in front of every single
  // navigation - a spinner, then the page's own loading state, then content.
  // Two waits back to back, invisible on a local machine at 17ms and a real
  // pause on a slow connection.
  //
  // Once the context holds a signed-in user that answer is good enough to draw
  // the page with. The check below still runs, in the background now, and a
  // session that has expired since redirects on the next render.
  //
  // This is not the security boundary and never was. Every API route the page
  // then calls checks the session itself, so an optimistic render of a page
  // whose session has lapsed shows a page whose requests all fail - it does
  // not show anyone another user's data.
  //
  // Still a spinner rather than a skeleton: this runs before a page has been
  // chosen, so there is no layout to hold open.
  if (!user.isAuthenticated && !checked) {
    return <Loader />;
  }

  // replace, so a bounced visit does not leave the protected URL sitting in
  // history for the back button to land on.
  return user.isAuthenticated ? (
    children
  ) : (
    <Navigate to="/login" state={{ from: location }} replace />
  );
}

export default PrivateRoute;

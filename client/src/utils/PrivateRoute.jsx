import { useEffect, useContext, useState } from "react";
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
  const { user, setUser } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    API.checkAuthState()
      .then((res) => {
        let { user, id, admin, isAuthenticated } = res.data;

        setUser({
          isAuthenticated: isAuthenticated,
          name: user,
          id: id,
          admin: admin,
        });

        setIsLoading(false);
      })
      .catch((err) => {
        setUser({
          isAuthenticated: false,
          name: null,
          id: null,
          admin: false,
        });
        console.log(err);
        setIsLoading(false);
      });
  }, [setUser]);

  // Still a spinner, deliberately. This runs before a page has been chosen, so
  // there is no layout to hold open - a skeleton here would be standing in for
  // a shape it cannot know, then being replaced by a different one.
  //
  // It gates every protected page, so the 100ms timer that used to sit here
  // was added to the front of every single navigation in the app.
  if (isLoading) {
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

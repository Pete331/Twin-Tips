import React, { useEffect, useContext, useState } from "react";
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

        loadingTimeout();
      })
      .catch((err) => {
        setUser({
          isAuthenticated: false,
          name: null,
          id: null,
          admin: false,
        });
        console.log(err);
        loadingTimeout();
      });
  }, [setUser]);

  const loadingTimeout = () => {
    setTimeout(() => {
      setIsLoading(false);
      clearTimeout(this);
    }, 100);
  };

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

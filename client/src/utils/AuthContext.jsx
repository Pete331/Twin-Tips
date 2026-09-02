import { createContext, useState, useCallback } from "react";
import API from "./AuthAPI";

export const AuthContext = createContext();

export default ({ children }) => {
  const [user, setUserState] = useState({
    isAuthenticated: false,
    name: null,
    id: null,
    admin: false,
  });

  // Whether the server has answered yet.
  //
  // Without this, isAuthenticated: false means both "signed out" and "we have
  // not asked", and everything downstream has to assume the pessimistic one.
  // That is what made the app's opening requests a queue: the season could not
  // be asked for until auth came back, and a page could not be drawn until the
  // season arrived - three round trips one after another, two of which had no
  // reason to wait.
  const [checked, setChecked] = useState(false);

  // Any answer counts, including "no". Every caller of setUser is recording
  // what the server said - a sign-in, a sign-out, an auth check - so there is
  // nowhere that learns the state without this becoming true.
  const setUser = useCallback((next) => {
    setUserState(next);
    setChecked(true);
  }, []);

  const logout = () => {
    API.logout()
      .then((res) => {
        initialUserState();
      })
      .catch((err) => {
        console.log(err);
        initialUserState();
      });
  };

  const initialUserState = () => {
    setUser({
      isAuthenticated: false,
      name: null,
      id: null,
      admin: false,
    });
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout, checked }}>
      {children}
    </AuthContext.Provider>
  );
};

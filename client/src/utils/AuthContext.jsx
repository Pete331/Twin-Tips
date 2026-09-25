import { createContext, useState, useCallback, useEffect } from "react";
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

  // Ask the server who is signed in, and record the answer.
  //
  // Any failure reads as signed out: a 401 means exactly that, and a server
  // that cannot be reached cannot vouch for a session either.
  const refreshAuth = useCallback(
    () =>
      API.checkAuthState()
        .then((res) => {
          const { user, id, admin, isAuthenticated, firstName, lastName } =
            res.data;

          setUser({
            isAuthenticated,
            name: user,
            id,
            admin,
            // For the avatar's initials. name is the username, which is one
            // word and gives no way to tell a first name from a last.
            firstName,
            lastName,
          });
        })
        .catch(() =>
          setUser({
            isAuthenticated: false,
            name: null,
            id: null,
            admin: false,
          })
        ),
    [setUser]
  );

  // Asked once as the app opens, whatever page it opens on.
  //
  // Only PrivateRoute used to ask, so a public page never found out: opening
  // the site at "/" or "/login" with a perfectly good session showed the
  // sign-in form, and refreshing the rules page showed "Login" in the bar and
  // took the bottom navigation away. The installed app opens at "/", so it
  // showed the form every time (UX audit finding #1). The sign-in page
  // already sends signed-in visitors on to Home - it was waiting on an answer
  // that nothing on a public page ever requested.
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

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
    <AuthContext.Provider
      value={{ user, setUser, logout, checked, refreshAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
};

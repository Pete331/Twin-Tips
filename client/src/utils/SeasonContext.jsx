import {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from "react";
import SeasonAPI from "./SeasonAPI";
import TipsAPI from "./TipsAPI";
import { AuthContext } from "./AuthContext";

export const SeasonContext = createContext();

// Holds the season state the server reports, so no component has to guess which
// year it is. TipsAPI is told the season too, since it is a plain module rather
// than a component and cannot read context.
export default ({ children }) => {
  const { user } = useContext(AuthContext);
  const [seasonState, setSeasonState] = useState(null);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [isLoadingSeason, setIsLoadingSeason] = useState(false);

  // Exposed so a component can ask for the state again without a page reload.
  // The countdown calls it the moment the lockout it is counting toward
  // passes, so the page flips to the locked view rather than sitting on a form
  // the server will now refuse.
  const refreshSeason = useCallback(() => {
    if (!user.isAuthenticated) return Promise.resolve();

    return SeasonAPI.getState()
      .then((res) => {
        setSeasonState(res.data);
        TipsAPI.setSeason(res.data.season);
      })
      .catch((err) => console.log(err));
  }, [user.isAuthenticated]);

  useEffect(() => {
    // The season endpoints require a session, so wait until there is one.
    if (!user.isAuthenticated) {
      setSeasonState(null);
      setAvailableSeasons([]);
      TipsAPI.setSeason(null);
      return;
    }

    let cancelled = false;
    setIsLoadingSeason(true);

    SeasonAPI.getState()
      .then((res) => {
        if (cancelled) return;
        setSeasonState(res.data);
        // Set before any page fetches, so requests carry the right year.
        TipsAPI.setSeason(res.data.season);
      })
      .catch((err) => console.log(err))
      .finally(() => {
        if (!cancelled) setIsLoadingSeason(false);
      });

    SeasonAPI.getAvailable()
      .then((res) => {
        if (!cancelled) setAvailableSeasons(res.data.seasons || []);
      })
      .catch((err) => console.log(err));

    return () => {
      cancelled = true;
    };
  }, [user.isAuthenticated]);

  return (
    <SeasonContext.Provider
      value={{ seasonState, availableSeasons, isLoadingSeason, refreshSeason }}
    >
      {children}
    </SeasonContext.Provider>
  );
};

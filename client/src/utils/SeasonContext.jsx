import React, { createContext, useState, useEffect, useContext } from "react";
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
      value={{ seasonState, availableSeasons, isLoadingSeason }}
    >
      {children}
    </SeasonContext.Provider>
  );
};

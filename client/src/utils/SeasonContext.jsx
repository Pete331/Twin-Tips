import {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
import SeasonAPI from "./SeasonAPI";
import TipsAPI from "./TipsAPI";
import { AuthContext } from "./AuthContext";

export const SeasonContext = createContext();

// Holds the season state the server reports, so no component has to guess which
// year it is. TipsAPI is told the season too, since it is a plain module rather
// than a component and cannot read context.
export default ({ children }) => {
  const { user, checked } = useContext(AuthContext);
  const [seasonState, setSeasonState] = useState(null);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [isLoadingSeason, setIsLoadingSeason] = useState(false);

  // Whether the request has been sent, as opposed to whether it has landed.
  // A ref rather than state because the effect has to read it in the same tick
  // it sets it.
  const asked = useRef(false);

  // Tied to unmount, not to each run of the effect below.
  //
  // This was a per-run `cancelled` flag, which is the usual shape and is wrong
  // once the effect can re-run while its own request is still in flight. Auth
  // resolving re-runs it, React runs the previous run's cleanup first, and the
  // season response that was already on its way got thrown away - while the
  // guard above stopped anything asking again. The provider sat on a skeleton
  // forever, having successfully fetched the data it then discarded.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

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
    // Asked for as the page opens, rather than after auth has answered.
    //
    // These endpoints do require a session - but the browser already holds the
    // cookie by the time this runs, so the request either succeeds or comes
    // back 401, and a 401 is exactly the case that ends at the login page
    // anyway. Waiting for auth first turned two independent requests into a
    // queue and cost a full round trip on every cold load, which on a slow
    // connection is the part that is felt.
    //
    // Only a definite "signed out" stops it. Before the check answers nobody
    // knows, and assuming yes costs one 401 for a visitor who is on their way
    // to the login page regardless.
    if (checked && !user.isAuthenticated) {
      setSeasonState(null);
      setAvailableSeasons([]);
      TipsAPI.setSeason(null);
      asked.current = false;
      return;
    }

    // The season is the same for everyone, so a copy fetched before we knew
    // who was asking is still the right answer and there is nothing to redo
    // when auth resolves. Without these two guards the effect runs once on
    // mount and again when isAuthenticated flips, asking twice for the same
    // thing - the ref covers the window where the first is still in flight.
    if (seasonState || asked.current) return;
    asked.current = true;

    setIsLoadingSeason(true);

    SeasonAPI.getState()
      .then((res) => {
        if (!alive.current) return;
        setSeasonState(res.data);
        // Set before any page fetches, so requests carry the right year.
        TipsAPI.setSeason(res.data.season);
      })
      .catch((err) => {
        // Frees the guard so signing in retries. Without this a speculative
        // 401 on the login page would mark the season as asked for, and the
        // fetch after sign-in would be skipped.
        asked.current = false;
        console.log(err);
      })
      .finally(() => {
        if (alive.current) setIsLoadingSeason(false);
      });

    SeasonAPI.getAvailable()
      .then((res) => {
        if (alive.current) setAvailableSeasons(res.data.seasons || []);
      })
      .catch((err) => console.log(err));
  }, [user.isAuthenticated, checked, seasonState]);

  return (
    <SeasonContext.Provider
      value={{ seasonState, availableSeasons, isLoadingSeason, refreshSeason }}
    >
      {children}
    </SeasonContext.Provider>
  );
};

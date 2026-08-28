import { useState, useEffect, useContext, useRef } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { SeasonContext } from "../../utils/SeasonContext";

// Where the round is up to, in one line, wherever tipping is offered.
//
// This replaces two components that between them said the same thing twice:
// "Lockout: No" above "Tips close in 2h 35m". If a countdown is running then
// lockout plainly has not happened, so the first line only added a word the
// rules never use - "lockout" appeared nowhere in the app's copy except that
// component and its own tooltip.
//
// One line, changing with the state, cannot contradict itself:
//
//   Round 24 starts in 7h 19m     while tipping is open
//   Round 24 has started          once the first game is under way
//   The 2026 season is over       when there is nothing left to play
//
// The deadline is the first bounce of the current round, which is the same
// fixture the server tests to decide lockout - see firstFixtureDate in
// services/season.js. One value feeds both, so this can never count down to a
// moment that is not the one being enforced.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Days and hours far out, minutes inside a day, seconds only inside an hour.
// A seconds tick counting down five days is noise, and it would re-render this
// 86,400 times a day to show a number nobody is reading yet.
export const formatRemaining = (ms) => {
  if (ms <= 0) return "0m";

  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  const seconds = Math.floor((ms % MINUTE) / SECOND);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

// Tick once a second only when seconds are on display; once a minute otherwise.
const intervalFor = (ms) => (ms < HOUR ? SECOND : MINUTE);

// A duration rather than a time of day, on purpose.
//
// This used to show the closing time alongside, formatted in the reader's own
// timezone - correct, and confusing. The competition spans two states: a game
// at 11:44am in Melbourne is 9:44am in Perth, so a WA member read a time two
// hours adrift of the one the fixture quotes and everyone else repeats.
//
// A countdown has no such problem: "in 2h 35m" means the same thing in every
// state and needs no zone to interpret.
//
// Coarse, for the screen-reader text: read once, not counted down.
const describeRemaining = (ms) => {
  if (ms >= DAY) {
    const days = Math.round(ms / DAY);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (ms >= HOUR) {
    const hours = Math.round(ms / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
};

const EXPLANATION =
  "Tips close when the first game of the round starts. After that you " +
  "cannot enter or edit your selections.";

const RoundStatus = () => {
  const { seasonState, refreshSeason } = useContext(SeasonContext);
  const [remaining, setRemaining] = useState(null);
  const timer = useRef();
  // Guards against re-requesting season state on every tick once the deadline
  // has passed but the server has not yet been asked again.
  const refreshed = useRef(false);

  const lockoutAt = seasonState && seasonState.lockoutAt;
  const serverTime = seasonState && seasonState.serverTime;
  const tippingOpen = Boolean(seasonState && seasonState.tippingOpen);

  useEffect(() => {
    if (!tippingOpen || !lockoutAt) {
      setRemaining(null);
      return;
    }

    const deadline = new Date(lockoutAt).getTime();

    // The difference between this device's clock and the server's, measured
    // once. A phone running ten minutes fast would otherwise show time left on
    // a round the server has already locked: the tip is refused and the app
    // looks broken rather than the clock.
    const skew = serverTime ? Date.now() - new Date(serverTime).getTime() : 0;

    refreshed.current = false;

    const tick = () => {
      const left = deadline - (Date.now() - skew);
      setRemaining(left);

      if (left <= 0) {
        // Ask the server rather than simply displaying zero. Someone sitting on
        // the tips page at the bounce would otherwise keep a live form that
        // every submission is now refused by. This also self-corrects if a
        // fixture time moved.
        if (!refreshed.current && refreshSeason) {
          refreshed.current = true;
          refreshSeason();
        }
        return;
      }

      clearTimeout(timer.current);
      timer.current = setTimeout(tick, intervalFor(left));
    };

    tick();

    return () => clearTimeout(timer.current);
  }, [tippingOpen, lockoutAt, serverTime, refreshSeason]);

  if (!seasonState) return null;

  // roundName rather than "Round " + currentRound: finals rounds are named,
  // and "Wildcard Finals has started" is right where "Round 27 has started"
  // would be a number nobody uses.
  const round = seasonState.roundName || `Round ${seasonState.currentRound}`;
  const counting =
    tippingOpen && lockoutAt && remaining !== null && remaining > 0;

  // A season with no fixtures loaded has no round to name. Saying nothing
  // beats "Round null has started".
  const hasRound =
    Boolean(seasonState.roundName) ||
    (seasonState.currentRound !== null && seasonState.currentRound !== undefined);

  if (!counting && !seasonState.seasonComplete && !hasRound) return null;

  // The season being over is its own thing. Saying a round "has started" when
  // the year has finished would be true of a game played months ago and
  // useless to read.
  const heading = seasonState.seasonComplete
    ? `The ${seasonState.season} season is over`
    : counting
    ? null
    : `${round} has started`;

  return (
    <Tooltip
      title={EXPLANATION}
      enterDelay={500}
      leaveDelay={200}
      enterTouchDelay={0}
      leaveTouchDelay={5000}
      placement="bottom-start"
    >
      {/* The Tooltip needs a single child that can hold a ref. */}
      <Box sx={{ display: "inline-flex", alignItems: "baseline", gap: 1 }}>
        {counting ? (
          <>
            {/* Hidden from assistive tech, because a value that changes every
                second is announced every second and makes the page unusable
                with a screen reader. The sentence below carries it once. */}
            <Typography variant="h6" component="p" aria-hidden="true">
              {round} starts in{" "}
              <Box component="span" sx={{ fontWeight: 700 }}>
                {formatRemaining(remaining)}
              </Box>
            </Typography>

            <Box component="span" sx={visuallyHidden}>
              {round} starts in about {describeRemaining(remaining)}. Tips
              close then.
            </Box>
          </>
        ) : (
          // error.dark, not "red": pure red measures 3.66:1 on the page
          // background, under the 4.5:1 normal text needs, and this line is
          // the whole message.
          <Typography variant="h6" component="p" sx={{ color: "error.dark" }}>
            {heading}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

export default RoundStatus;

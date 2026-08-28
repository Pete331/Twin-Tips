import { useState, useEffect, useContext, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { SeasonContext } from "../../utils/SeasonContext";

// How long until selections freeze, shown wherever tipping is offered.
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
// hours adrift of the one the fixture quotes and everyone else repeats. Naming
// the zone would fix the ambiguity but not the mental arithmetic.
//
// A countdown has no such problem: "in 2h 35m" means the same thing in every
// state, and needs no zone to interpret. It is also the question actually
// being asked - how long have I got - rather than a timestamp to subtract from
// the current time yourself.
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

const LockoutCountdown = () => {
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

  // Nothing to count down to: tipping is closed, it is finals, or the round has
  // already started. The lockout indicator alongside says so already.
  if (!tippingOpen || !lockoutAt || remaining === null || remaining <= 0) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 1 }}>
      {/* Hidden from assistive tech, because a value that changes every second
          is announced every second and makes the page unusable with a screen
          reader. The sentence below carries the same information once. */}
      <Typography aria-hidden="true">
        Tips close in{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          {formatRemaining(remaining)}
        </Box>
      </Typography>

      {/* The accessible equivalent: rounded, and stated once rather than
          counted.

          MUI's own visuallyHidden rather than a hand-written one. Mine used
          width: 1 and height: 1 meaning pixels, but sx treats a bare number
          between 0 and 1 as a fraction for these properties - so it resolved
          to 100% by 100%. An absolutely positioned, nowrap span the full size
          of the page hung off the bottom right of the layout: the document
          became 950x887 inside a 917x680 window, the page scrolled both ways,
          and the footer appeared to float with 200px of nothing under it.
          Invisible, and dragging the layout around behind everyone's back. */}
      <Box component="span" sx={visuallyHidden}>
        Tips close in about {describeRemaining(remaining)}.
      </Box>
    </Box>
  );
};

export default LockoutCountdown;

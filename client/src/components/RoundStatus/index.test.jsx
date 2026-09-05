// The one line telling everyone where the round is up to.
//
// It replaced two components that between them said the same thing twice
// ("Lockout: No" above "Tips close in 2h 35m"), so the value here is that one
// line cannot contradict itself. Which means the interesting tests are the
// state transitions, not the formatting: open and counting, started, waiting on
// a ladder, and the season being over.
//
// The subtle one is clock skew. A phone running ten minutes fast would show
// time left on a round the server has already locked - the tip is then refused
// and the app looks broken rather than the clock does.
//
// This file also shows how to test anything reading SeasonContext: render it
// inside a provider with a plain object as the value.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import RoundStatus, { formatRemaining } from "./index";
import { SeasonContext } from "../../utils/SeasonContext";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A fixed "now", so a countdown is the same length on every run.
const NOW = new Date("2026-06-13T02:00:00.000Z");

// Mid-season, tipping open, the round bouncing in three hours.
const state = (over = {}) => ({
  season: 2026,
  currentRound: 12,
  roundName: "Round 12",
  tippingOpen: true,
  homeAndAwayComplete: false,
  seasonComplete: false,
  ladderReady: true,
  lockoutAt: new Date(NOW.getTime() + 3 * HOUR).toISOString(),
  serverTime: NOW.toISOString(),
  ...over,
});

const draw = (over, refreshSeason = () => {}) =>
  render(
    <SeasonContext.Provider
      value={{ seasonState: over === null ? null : state(over), refreshSeason }}
    >
      <RoundStatus />
    </SeasonContext.Provider>
  );

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRemaining", () => {
  // Seconds only inside an hour: a seconds tick counting down five days is
  // noise, and re-renders this 86,400 times a day for a number nobody reads.
  test("days and hours far out", () => {
    expect(formatRemaining(2 * DAY + 5 * HOUR)).toBe("2d 5h");
  });

  test("hours and minutes inside a day", () => {
    expect(formatRemaining(3 * HOUR + 20 * MINUTE)).toBe("3h 20m");
  });

  test("minutes and seconds inside an hour", () => {
    expect(formatRemaining(20 * MINUTE + 30 * 1000)).toBe("20m 30s");
  });

  test("seconds alone in the last minute", () => {
    expect(formatRemaining(30 * 1000)).toBe("30s");
  });

  test("a passed deadline is zero, not a negative countdown", () => {
    expect(formatRemaining(0)).toBe("0m");
    expect(formatRemaining(-5 * MINUTE)).toBe("0m");
  });
});

// The visible countdown, which is deliberately aria-hidden. Querying it by that
// attribute keeps it distinct from the screen-reader sentence beside it - both
// begin "Round 12 starts in", and telling them apart is the whole arrangement.
const visibleLine = () => document.querySelector('p[aria-hidden="true"]');

describe("while tipping is open", () => {
  test("it counts down to the first bounce", () => {
    draw();
    expect(visibleLine()).toHaveTextContent("Round 12 starts in 3h 0m");
  });

  // The countdown itself is aria-hidden - a value changing every second is
  // announced every second and makes the page unusable with a screen reader.
  // A coarser sentence carries it once instead.
  test("a screen reader gets the duration once, not every second", () => {
    draw();
    expect(
      screen.getByText(/Round 12 starts in about 3 hours\. Tips close then\./)
    ).toBeInTheDocument();
  });

  test("the countdown updates as time passes", () => {
    draw();
    expect(screen.getByText("3h 0m")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(MINUTE);
    });

    expect(screen.getByText("2h 59m")).toBeInTheDocument();
  });

  // The whole point of a duration rather than a time of day: the competition
  // spans two states, and "in 3h" means the same thing in both.
  test("no time of day is shown anywhere", () => {
    const { container } = draw();
    expect(container.textContent).not.toMatch(/\d{1,2}:\d{2}\s*(am|pm)/i);
  });
});

describe("clock skew", () => {
  // A device running ten minutes fast. Measured against serverTime once, so
  // the countdown follows the server rather than the phone.
  test("a fast device does not show time the server has already taken", () => {
    draw({
      serverTime: new Date(NOW.getTime() - 10 * MINUTE).toISOString(),
      lockoutAt: new Date(NOW.getTime() + 5 * MINUTE).toISOString(),
    });

    // The server thinks it is 10 minutes earlier, so the deadline it set is
    // 15 minutes away by its own clock, not 5.
    expect(screen.getByText(/^15m/)).toBeInTheDocument();
  });

  test("a device in step with the server counts down plainly", () => {
    draw({ lockoutAt: new Date(NOW.getTime() + 5 * MINUTE).toISOString() });
    expect(screen.getByText(/^5m/)).toBeInTheDocument();
  });
});

describe("once the round is under way", () => {
  test("it says the round has started", () => {
    draw({ tippingOpen: false });
    expect(screen.getByText("Round 12 has started")).toBeInTheDocument();
  });

  // A finals round is named, not numbered - "Wildcard Finals has started" is
  // right where "Round 27 has started" is a number nobody uses.
  test("a named round is named rather than numbered", () => {
    draw({ tippingOpen: false, roundName: "Wildcard Finals", currentRound: 27 });
    expect(screen.getByText("Wildcard Finals has started")).toBeInTheDocument();
  });

  // "has started" is wrong in the gap between a round finishing and the next
  // round's ladder being written: tipping is shut, but the round it is shut for
  // has not begun.
  test("waiting on a ladder says what it is waiting for", () => {
    draw({ tippingOpen: false, ladderReady: false });
    expect(
      screen.getByText("Waiting on the ladder before Round 12 opens")
    ).toBeInTheDocument();
  });

  // Asking the server rather than displaying zero: somebody sitting on the tips
  // page at the bounce would otherwise keep a live form every submission is now
  // refused by.
  test("reaching the deadline asks the server for the new state", () => {
    const refreshSeason = vi.fn();
    draw({ lockoutAt: new Date(NOW.getTime() + MINUTE).toISOString() }, refreshSeason);

    expect(refreshSeason).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2 * MINUTE);
    });

    expect(refreshSeason).toHaveBeenCalled();
  });

  test("it asks once, not on every tick after the deadline", () => {
    const refreshSeason = vi.fn();
    draw({ lockoutAt: new Date(NOW.getTime() + MINUTE).toISOString() }, refreshSeason);

    act(() => {
      vi.advanceTimersByTime(10 * MINUTE);
    });

    expect(refreshSeason).toHaveBeenCalledTimes(1);
  });
});

describe("when Twin Tips is finished for the year", () => {
  // Twin Tips ends with the home-and-away rounds, whatever the AFL calendar
  // does next. Naming a finals round here reads as though the app were
  // following the finals.
  test("it says the Twin Tips season is over, not the AFL one", () => {
    draw({ tippingOpen: false, homeAndAwayComplete: true, roundName: "Semi-Finals" });

    expect(screen.getByText("The 2026 Twin Tips season is over")).toBeInTheDocument();
    expect(screen.queryByText(/Semi-Finals/)).not.toBeInTheDocument();
  });

  test("it does not name a round that has started", () => {
    draw({ tippingOpen: false, homeAndAwayComplete: true });
    expect(screen.queryByText(/has started/)).not.toBeInTheDocument();
  });
});

describe("nothing to say", () => {
  test("no season state renders nothing", () => {
    const { container } = draw(null);
    expect(container).toBeEmptyDOMElement();
  });

  // A season with no fixtures loaded has no round to name, and "Round null has
  // started" is worse than silence.
  test("a season with no round renders nothing", () => {
    const { container } = draw({
      tippingOpen: false,
      roundName: null,
      currentRound: null,
    });
    expect(container).toBeEmptyDOMElement();
  });
});

// One line per league, saying what the round did there.
//
// This is the only place the home page can name a winner. The table beneath it
// holds everyone's tips and has no league to decide one within - it used to
// gild the site-wide winner instead, which is nobody's league winner in
// particular. Round 23 of the real season is the example: the page crowned
// somebody who was not even a member of the league whose round it was.
//
// Four states, and they are different answers rather than degrees of one. The
// empty ones are named rather than hidden, because a league quietly missing
// from the list reads as something broken.

import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { LeagueRoundLine } from "./index";

// A weekly league that ran the round, with the reader third of five.
const detail = (over = {}) => ({
  league: "pool",
  name: "Twin Tips Original",
  type: "weekly",
  round: 23,
  status: "scored",
  startRound: 0,
  pays: true,
  buyIn: 15,
  entrants: 5,
  share: 5,
  winners: ["seeds"],
  standings: [],
  you: {
    status: "entered",
    rank: 3,
    tied: false,
    winnings: 0,
    joinedAtRound: 0,
  },
  ...over,
});

const draw = (over) => render(<LeagueRoundLine detail={detail(over)} />);

describe("a round the league actually ran", () => {
  test("it names the league and who won", () => {
    draw();

    expect(screen.getByText("Twin Tips Original")).toBeInTheDocument();
    expect(screen.getByText("seeds won")).toBeInTheDocument();
  });

  test("and where you came in it", () => {
    draw();
    expect(screen.getByText("3rd of 5")).toBeInTheDocument();
  });

  // Winnings are stored in buy-in units - a pool of five entrants is a 5 - so
  // every figure has to be multiplied before it is shown. This line printed the
  // unit, which beside a $15 buy-in read "won 5" for $75.
  test("winning says so, as money rather than as units", () => {
    draw({
      buyIn: 15,
      winners: ["you"],
      you: { status: "entered", rank: 1, winnings: 5 },
    });

    expect(screen.getByText("1st of 5, won $75")).toBeInTheDocument();
    expect(screen.queryByText(/won 5$/)).not.toBeInTheDocument();
  });

  test("a different buy-in gives a different amount for the same pool", () => {
    draw({
      buyIn: 10,
      entrants: 3,
      winners: ["you"],
      you: { status: "entered", rank: 1, winnings: 3 },
    });

    expect(screen.getByText("1st of 3, won $30")).toBeInTheDocument();
  });

  // A weekly league always has a buy-in, but the round detail is upserted and
  // an older league could be missing one. Better to say where they came than to
  // print "$NaN" beside it.
  test("no buy-in to multiply by says the place and nothing more", () => {
    draw({
      buyIn: undefined,
      winners: ["you"],
      you: { status: "entered", rank: 1, winnings: 5 },
    });

    expect(screen.getByText("1st of 5")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  test("a shared place reads as shared", () => {
    draw({ you: { status: "entered", rank: 3, tied: true, winnings: 0 } });
    expect(screen.getByText("equal 3rd of 5")).toBeInTheDocument();
  });

  test("two winners are both named", () => {
    draw({ winners: ["seeds", "dummyd"] });
    expect(screen.getByText("seeds and dummyd won")).toBeInTheDocument();
  });
});

// Missing a round is a free pass in this competition - nothing goes in, nothing
// can be won - so it must not read as having come last.
test("not entering is said plainly, not shown as a placing", () => {
  draw({ you: { status: "noTip", rank: null, winnings: 0 } });

  expect(screen.getByText("you did not enter")).toBeInTheDocument();
  expect(screen.queryByText(/of 5/)).not.toBeInTheDocument();
});

describe("a round the league has nothing to say about", () => {
  // The league did not exist yet, or the round is one it never runs at all -
  // a finals round, in a home-and-away competition.
  test("a league that started later says when it started", () => {
    draw({ status: "beforeLeague", startRound: 26, winners: [], you: null });

    expect(screen.getByText("This league started at round 26")).toBeInTheDocument();
  });

  // A different thing from the league not existing, and the difference matters
  // to the person reading it.
  test("joining late says when you joined", () => {
    draw({
      winners: [],
      you: { status: "beforeYou", joinedAtRound: 15, rank: null, winnings: 0 },
    });

    expect(screen.getByText("You joined at round 15")).toBeInTheDocument();
  });

  test("a round nobody entered is not a round anyone lost", () => {
    draw({ status: "noEntries", entrants: 0, winners: [], you: { status: "noTip" } });

    expect(screen.getByText("Nobody entered this round")).toBeInTheDocument();
  });
});

// A season league is one contest running all year. Its rounds have a best
// performance and no pool, so naming a winner would invent a payout.
test("a season league reports who led, not who won", () => {
  draw({
    name: "the oasis1",
    type: "season",
    pays: false,
    winners: [],
    share: 0,
    entrants: 2,
    standings: [
      { username: "ann", rank: 1 },
      { username: "bob", rank: 2 },
    ],
    you: { status: "entered", rank: 2, winnings: 0 },
  });

  expect(screen.getByText("ann led")).toBeInTheDocument();
  expect(screen.queryByText(/won/)).not.toBeInTheDocument();
});

test("a season league with joint leaders names both", () => {
  draw({
    type: "season",
    pays: false,
    winners: [],
    standings: [
      { username: "ann", rank: 1 },
      { username: "bob", rank: 1 },
    ],
    you: { status: "entered", rank: 1, tied: true, winnings: 0 },
  });

  expect(screen.getByText("ann and bob led")).toBeInTheDocument();
});

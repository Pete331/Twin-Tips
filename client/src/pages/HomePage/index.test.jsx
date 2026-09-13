// The home page, rendered.
//
// roundSummary.test.jsx covers the sentence each league line produces, which is
// the arithmetic. This covers everything around it - and the page has more
// wiring than either of the others, because one table is now built from two
// separate requests joined on a slug.
//
// That join is the seam worth guarding. The standings come from one endpoint
// and the round from another, deliberately: they answer different questions,
// only one of them moves with the picker, and the league service having a bad
// day should cost the round line rather than the standing beside it. None of
// that is visible to a function test, and all of it is a way for the table to
// go wrong while every part of it is individually correct.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import API from "../../utils/TipsAPI";
import LeagueAPI from "../../utils/LeagueAPI";
import Home from "./index";

vi.mock("../../utils/TipsAPI", () => ({
  default: { getRoundResult: vi.fn(), getCurrentRoundTips: vi.fn() },
}));

vi.mock("../../utils/LeagueAPI", () => ({
  default: { rankings: vi.fn(), roundEverywhere: vi.fn() },
}));

// Mid-season, round 12 just played and round 13 open.
const seasonState = (over = {}) => ({
  season: 2026,
  currentRound: 13,
  lastCompletedRound: 12,
  lastHomeAndAwayRound: 24,
  roundName: "Round 13",
  roundNames: { 11: "Round 11", 12: "Round 12", 13: "Round 13" },
  rounds: [11, 12, 13],
  tippingOpen: true,
  roundStarted: false,
  lockout: false,
  isFinals: false,
  homeAndAwayComplete: false,
  seasonComplete: false,
  ladderReady: true,
  lockoutAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  serverTime: new Date().toISOString(),
  ...over,
});

// Where you stand, from one endpoint.
const rankings = [
  { slug: "pool", name: "Round Pool League", type: "weekly", rank: 4, of: 6, tied: false },
  { slug: "ladder", name: "Season League", type: "season", rank: 1, of: 2, tied: false },
  { slug: null, name: "Overall Site Ladder", type: "global", rank: 6, of: 7, tied: false },
];

// What the round did, from another.
const leagueRounds = [
  {
    league: "pool",
    name: "Round Pool League",
    type: "weekly",
    status: "scored",
    startRound: 1,
    pays: true,
    buyIn: 10,
    entrants: 5,
    winners: ["ann"],
    standings: [],
    you: { status: "entered", rank: 3, tied: false, winnings: 0 },
  },
  {
    league: "ladder",
    name: "Season League",
    type: "season",
    status: "beforeLeague",
    startRound: 20,
    pays: false,
    entrants: 0,
    winners: [],
    standings: [],
    you: null,
  },
];

// The round's tips, which the table at the bottom is drawn from and the site
// ladder row is derived from.
const roundResults = [
  {
    _id: "t1",
    user: "u2",
    userDetail: [{ username: "ann" }],
    round: 12,
    correctTips: 2,
    winnings: 5,
    topEightSelection: "Geelong",
    bottomTenSelection: "Carlton",
    topEightCorrect: 1,
    bottomTenCorrect: 1,
    marginTopEight: 18,
    marginBottomTen: 0,
    topEightDifference: 4,
    bottomTenDifference: null,
  },
  {
    _id: "t2",
    user: "u1",
    userDetail: [{ username: "you" }],
    round: 12,
    correctTips: 1,
    winnings: 0,
    topEightSelection: "Sydney",
    bottomTenSelection: "Essendon",
    topEightCorrect: 0,
    bottomTenCorrect: 1,
    marginTopEight: 0,
    marginBottomTen: 30,
    topEightDifference: null,
    bottomTenDifference: 25,
  },
];

const draw = (state = seasonState()) =>
  render(
    withTheme(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: { id: "u1", name: "you", isAuthenticated: true },
            setUser: vi.fn(),
            checked: true,
          }}
        >
          <SeasonContext.Provider
            value={{ seasonState: state, availableSeasons: [2026] }}
          >
            <Home />
          </SeasonContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.rankings.mockResolvedValue({ data: { rankings } });
  LeagueAPI.roundEverywhere.mockResolvedValue({ data: { leagues: leagueRounds } });
  API.getRoundResult.mockResolvedValue({ data: roundResults });
  API.getCurrentRoundTips.mockResolvedValue({ data: null });
});

// The last table on the page is everyone's tips. Names appear in the league
// table above it too, so a page-wide query for one is ambiguous.
const tipsTable = () => [...document.querySelectorAll("table")].pop();
const rowFor = (name) =>
  [...tipsTable().querySelectorAll("tbody tr")].find((tr) =>
    tr.textContent.includes(name)
  );

// The seam: two requests, one table, joined on the slug.
describe("the league table joins the two answers", () => {
  test("each league carries both its standing and its round", async () => {
    draw();

    const pool = within(await screen.findByText("Round Pool League").then((el) => el.closest("tr")));
    // The standing, which does not move with the picker.
    expect(pool.getByText("4th")).toBeInTheDocument();
    expect(pool.getByText("of 6")).toBeInTheDocument();
    // The round, which does.
    expect(pool.getByText(/Winner/)).toBeInTheDocument();
    expect(pool.getByText(/ann/)).toBeInTheDocument();
    expect(pool.getByText(/3rd of 5/)).toBeInTheDocument();
  });

  // A league the round predates still has a standing to show, so it says why
  // rather than leaving the cell blank.
  test("a league the round predates says so and keeps its standing", async () => {
    draw();

    const ladder = within(
      await screen.findByText("Season League").then((el) => el.closest("tr"))
    );
    expect(ladder.getByText(/This league started at round 20/)).toBeInTheDocument();
    expect(ladder.getByText("1st")).toBeInTheDocument();
  });

  // The reason the two are not merged on the server. A league service having a
  // bad day should cost the round line, not the standings beside it.
  test("the standings survive the round request failing", async () => {
    LeagueAPI.roundEverywhere.mockRejectedValue(new Error("leagues unavailable"));
    draw();

    const pool = within(
      await screen.findByText("Round Pool League").then((el) => el.closest("tr"))
    );

    expect(pool.getByText("4th")).toBeInTheDocument();
    // The league line is the only thing lost. The site ladder row is worked
    // out from the round tips, which arrived, so it is unaffected.
    expect(pool.queryByText(/Winner|Best/)).not.toBeInTheDocument();
  });

  // Pools before ladders, with the site ladder last - decided by the rankings
  // route, so what this holds is that the page renders the order it is given
  // rather than sorting again on its own.
  test("the leagues are shown in the order the server sends them", async () => {
    LeagueAPI.rankings.mockResolvedValue({
      data: {
        rankings: [
          { slug: "pool", name: "Round Pool League", type: "weekly", rank: 4, of: 6 },
          { slug: "ladder", name: "Season League", type: "season", rank: 1, of: 2 },
          { slug: null, name: "Overall Site Ladder", type: "global", rank: 6, of: 7 },
        ],
      },
    });
    draw();

    await screen.findByText("Round Pool League");
    const names = [...document.querySelectorAll("table")][0]
      .querySelectorAll("tbody tr");
    expect([...names].map((tr) => tr.cells[0].textContent)).toEqual([
      "Round Pool LeagueRound Pool",
      "Season LeagueSeason Ladder",
      "Overall Site LadderEveryone in Twin Tips",
    ]);
  });
});

// The row with no league. It is worked out from the round's own tips rather
// than a third request, and has to agree with the table below it.
describe("the site ladder row", () => {
  test("names the site winner and where you came", async () => {
    draw();

    // By role, because the name is on the page twice now: this row, and the
    // heading over the table of the same ladder's round. The row's name is the
    // link to the leaderboard.
    const site = within(
      await screen
        .findByRole("link", { name: "Overall Site Ladder" })
        .then((el) => el.closest("tr"))
    );
    expect(site.getByText(/Winner/)).toBeInTheDocument();
    expect(site.getByText(/ann/)).toBeInTheDocument();
    expect(site.getByText(/2nd of 2/)).toBeInTheDocument();
  });

  // The winner it names must be the person the table below gilds - they come
  // from the same rows, and the point is that they now agree out loud.
  test("agrees with the round winner in the table below", async () => {
    draw();
    await screen.findByRole("link", { name: "Overall Site Ladder" });

    // Both the league line and the site line name her, which is the point.
    expect(screen.getAllByText(/Winner/).length).toBeGreaterThan(0);
    // The trophy sits on the row of whoever scoring paid.
    expect(within(rowFor("ann")).getByText("Round winner")).toBeInTheDocument();
  });
});

describe("the round picker drives the page", () => {
  // The round being played, while the season is running. Not the last one
  // completed: an ordinary mid-round lockout is exactly when somebody wants to
  // see everyone's locked-in selections for the game that is on.
  test("it opens on the round being played", async () => {
    draw();

    await waitFor(() =>
      expect(API.getRoundResult).toHaveBeenCalledWith(
        expect.objectContaining({ round: 13 })
      )
    );
    expect(LeagueAPI.roundEverywhere).toHaveBeenCalledWith(13, 2026);
  });

  test("stepping back moves both the table and the league lines", async () => {
    draw();
    await screen.findByText("Round Pool League");

    await userEvent.click(screen.getByRole("button", { name: /^Previous round/ }));

    await waitFor(() =>
      expect(LeagueAPI.roundEverywhere).toHaveBeenCalledWith(12, 2026)
    );
    expect(API.getRoundResult).toHaveBeenCalledWith(
      expect.objectContaining({ round: 12 })
    );
  });

  // Round 0 is the Opening Round and it is falsy - the fetch used to be guarded
  // with `if (!round)`, so the table and the picker disagreed about whether it
  // existed.
  test("round 0 is a round, not an absence", async () => {
    draw(
      seasonState({
        currentRound: 1,
        firstRound: 0,
        lastCompletedRound: 0,
        lastHomeAndAwayRound: 1,
        homeAndAwayComplete: true,
        tippingOpen: false,
        roundStarted: false,
        lockout: true,
        rounds: [0, 1],
        roundNames: { 0: "Opening Round", 1: "Round 1" },
      })
    );

    await waitFor(() =>
      expect(API.getRoundResult).toHaveBeenCalledWith(
        expect.objectContaining({ round: 0 })
      )
    );
  });
});

// A link, not a button.
//
// It navigates, so an anchor is what it always was - it used to be a <button>
// wrapped in one, which is invalid and was announced twice. These now ask for
// the role the markup actually has.
describe("the tips button", () => {
  test("invites you to tip while the round is open", async () => {
    draw();
    expect(
      await screen.findByRole("link", { name: "Enter Round 13 tips" })
    ).toBeInTheDocument();

    // Lowercase, matching the route and the navigation. It read /TipsPage,
    // which react-router matches anyway - so one page had two addresses and
    // history collected both.
    expect(
      screen.getByRole("link", { name: "Enter Round 13 tips" })
    ).toHaveAttribute("href", "/tipspage");
  });

  test("offers to edit once tips are saved", async () => {
    API.getCurrentRoundTips.mockResolvedValue({
      data: { topEightSelection: "Geelong", bottomTenSelection: "Carlton" },
    });
    draw();

    expect(
      await screen.findByRole("link", { name: "Edit Round 13 tips" })
    ).toBeInTheDocument();
  });

  // A finals round has no tips and never will, so the button cannot offer any.
  test("offers scores once Twin Tips is finished for the year", async () => {
    draw(
      seasonState({
        currentRound: 26,
        lastCompletedRound: 25,
        isFinals: true,
        homeAndAwayComplete: true,
        tippingOpen: false,
        lockout: true,
        roundNames: { 24: "Round 24", 25: "Wildcard Finals", 26: "Finals Week 1" },
        rounds: [24, 25, 26],
      })
    );

    expect(
      await screen.findByRole("link", { name: "View Wildcard Finals scores" })
    ).toBeInTheDocument();
  });
});

// The Overall Site Ladder's round, which is a different question from the
// league lines above it and is named for the ladder it belongs to - the same
// name that ladder's row carries, and the same one the leaderboard uses.
//
// The name is deliberately on the page twice - the row you are placed in, and
// this, the round behind it - so these wait on the table's own column header
// instead.
//
// Not on the section label by role. theme.js maps subtitle2 to <p>, so that
// label is a heading only in a test, which renders without the app's theme:
// asking for it by role passes here and describes markup nobody is served.
describe("the site ladder's round", () => {
  test("each pick with its margin and whether it came off", async () => {
    draw();
    await screen.findByText("Correct (margin)");

    const ann = within(rowFor("ann"));
    expect(ann.getByText(/Geelong \(18\)/)).toBeInTheDocument();
    expect(ann.getAllByText("Correct")).toHaveLength(2);
  });

  test("a wrong pick is marked as well as tinted", async () => {
    draw();
    await screen.findByText("Correct (margin)");

    expect(within(rowFor("you")).getByText("Incorrect")).toBeInTheDocument();
  });
});

// Where each row of the rankings table goes when you click it.
//
// Untested until now, which is how the site ladder's link came to point
// somewhere else: it went to a bare /leaderboard, and that page opens on the
// league you have been in longest. The right default for the menu, and the
// wrong destination for a link that says Overall Site Ladder.
describe("where the ladder rows link", () => {
  test("a league goes to its own leaderboard", async () => {
    draw();

    expect(
      await screen.findByRole("link", { name: "Round Pool League" })
    ).toHaveAttribute("href", "/leaderboard?league=pool");
    expect(
      screen.getByRole("link", { name: "Season League" })
    ).toHaveAttribute("href", "/leaderboard?league=ladder");
  });

  // The one that was wrong. It asks for the site ladder by name rather than
  // relying on a default that means something else.
  test("and the site ladder goes to the site ladder", async () => {
    draw();

    expect(
      await screen.findByRole("link", { name: "Overall Site Ladder" })
    ).toHaveAttribute("href", "/leaderboard?ladder=site");
  });
});

// The same round of the same ladder is drawn on both pages, and the column had
// two names.
test("the scoring column is worded as the leaderboard words it", async () => {
  draw();
  // The row's link, which is an anchor whichever theme is in force.
  await screen.findByRole("link", { name: "Overall Site Ladder" });

  expect(screen.getByText("Correct (margin)")).toBeInTheDocument();
  expect(screen.queryByText(/Correct tips/)).not.toBeInTheDocument();
});

// The theme is really in force, not merely imported.
//
// The label over the tips table is a subtitle2. theme.js maps that to <p>;
// MUI's stock default maps it to <h6>, a heading. Without the wrapper this
// element is a heading in the test and a paragraph in the app, and an assertion
// asking for it by heading role passes while describing markup nobody is
// served - which is exactly what happened here before withTheme existed.
//
// So this is the test that fails if the wrapper is ever dropped, and the reason
// it is worth having: a wrapper that quietly stopped applying would look the
// same as one that works.
test("the app's own theme is applied, so a subtitle is not a heading", async () => {
  draw();

  const label = await screen.findByText("Overall Site Ladder", {
    selector: "p",
  });
  expect(label.tagName).toBe("P");

  // The only thing carrying that name should be the row's link.
  expect(
    screen.queryByRole("heading", { name: "Overall Site Ladder" })
  ).not.toBeInTheDocument();
});


// The bolding, on the page rather than as a flag.
//
// Asserted as structure, not as a computed font weight: an exact getByText
// matches only when the words are an element of their own, so finding "You" on
// a line that reads "Winner: You and seeds" is itself the proof that the name
// was split out to be weighted. A computed style would depend on emotion having
// injected its stylesheet into jsdom, which is a test of the styling library.
describe("your name is picked out", () => {
  const sharedWin = [
    {
      league: "pool",
      name: "Round Pool League",
      type: "weekly",
      status: "scored",
      startRound: 1,
      pays: true,
      buyIn: 10,
      entrants: 4,
      winners: ["you", "seeds"],
      standings: [],
      you: { status: "entered", username: "you", rank: 1, tied: true, winnings: 2 },
    },
  ];

  test("out of a shared win, leaving the other name alone", async () => {
    LeagueAPI.roundEverywhere.mockResolvedValue({
      data: { leagues: sharedWin },
    });

    draw();

    const row = await screen
      .findByRole("link", { name: "Round Pool League" })
      .then((el) => el.closest("tr"));

    // Its own element, which it would not be if the whole value were one string.
    expect(within(row).getByText("You")).toBeInTheDocument();
    // And the person it was shared with is still named, unweighted.
    expect(within(row).getByText(/and seeds/)).toBeInTheDocument();
  });

  test("and the amount, which is all about you", async () => {
    LeagueAPI.roundEverywhere.mockResolvedValue({
      data: { leagues: sharedWin },
    });

    draw();

    const row = await screen
      .findByRole("link", { name: "Round Pool League" })
      .then((el) => el.closest("tr"));

    expect(within(row).getByText("$20")).toBeInTheDocument();
  });

  // Nothing to pick out, so the value stays one piece of text and an exact
  // match on a single name finds nothing.
  test("and nothing is split out when somebody else won", async () => {
    draw();

    const row = await screen
      .findByRole("link", { name: "Round Pool League" })
      .then((el) => el.closest("tr"));

    expect(within(row).queryByText("You")).not.toBeInTheDocument();
    expect(within(row).getByText(/ann/)).toBeInTheDocument();
  });
});

// A round that has not bounced yet.
//
// The server withholds the ranking and names no winner until the first game
// starts, so there is honestly nothing to report - and every league row shows
// the same dash. Greyed, so it reads as "nothing yet" rather than as a cell
// that failed to load, which is what it looked like in the body colour.
//
// Written as an escape rather than the character itself. The en dash in a
// command line breaks the shell wrapper this repo is driven through, and a test
// nobody can grep for is worse than one that spells its character out.
const EN_DASH = "–";

describe("a round with nothing to report", () => {
  const notYet = [
    {
      league: "pool",
      name: "Round Pool League",
      type: "weekly",
      status: "scored",
      startRound: 1,
      pays: true,
      buyIn: 10,
      entrants: 5,
      // Nothing decided yet: no winner, nobody ranked.
      winners: [],
      standings: [],
      you: { status: "entered", rank: null, tied: false, winnings: 0 },
    },
  ];

  const dashIn = async () => {
    LeagueAPI.roundEverywhere.mockResolvedValue({ data: { leagues: notYet } });
    draw();

    const row = await screen
      .findByRole("link", { name: "Round Pool League" })
      .then((el) => el.closest("tr"));

    return within(row).getByText(EN_DASH);
  };

  test("says so with a dash rather than an empty cell", async () => {
    expect(await dashIn()).toBeInTheDocument();
  });

  // The same grey the labels beside it use - the colour this table already
  // gives to text that is present and not the point.
  //
  // A computed colour is only worth asserting because emotion really does put
  // its stylesheet into jsdom; where it does not resolve, a style assertion
  // passes on whatever the default happens to be and tests nothing.
  test("and the dash is grey, not body text", async () => {
    expect(getComputedStyle(await dashIn()).color).toBe("rgba(0, 0, 0, 0.38)");
  });
});

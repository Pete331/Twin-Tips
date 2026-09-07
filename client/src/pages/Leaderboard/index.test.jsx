// The leaderboard, rendered.
//
// Every other client test here exercises a component or a pure function in
// isolation, and twice in one day that missed something the page had wrong.
// The live quarter clock was added to FixtureCard and FixtureCenterCard, both
// were tested, every test passed, and nothing appeared - because TipsPage was
// never changed to pass the prop down. A tie marker landed on the wrong one of
// two identical rows, because the flag meant "level with the row above" while
// the table was displayed in another order.
//
// Both were seams between pieces that were individually correct. A test that
// renders the page and drives it the way a person would is the only kind that
// sees them, so this covers the wiring rather than the arithmetic:
//
//   - the league's type decides which view it opens on
//   - the toggle actually changes what is fetched
//   - the round picker's value reaches the request
//   - the table reads the fields the server really sends
//
// LeagueAPI is stubbed because the point is what the page asks for and what it
// does with the answer. What the server puts in that answer is held to account
// by services/leagueRounds.detail.test.js against a real database.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { SeasonContext } from "../../utils/SeasonContext";
import LeagueAPI from "../../utils/LeagueAPI";
import Leaderboard from "./index";

vi.mock("../../utils/LeagueAPI", () => ({
  default: {
    mine: vi.fn(),
    standings: vi.fn(),
    global: vi.fn(),
    round: vi.fn(),
    detail: vi.fn(),
    roundEverywhere: vi.fn(),
  },
}));

const WEEKLY = { slug: "pool", name: "Round Pool League", type: "weekly" };
const SEASON_LEAGUE = { slug: "ladder", name: "Season League", type: "season" };

// Mid-season, with rounds to pick from. lastTwinTipsRound reads these to decide
// which round the view opens on.
const seasonState = {
  season: 2026,
  currentRound: 13,
  lastCompletedRound: 12,
  lastHomeAndAwayRound: 24,
  roundNames: { 11: "Round 11", 12: "Round 12", 13: "Round 13" },
  rounds: [11, 12, 13],
  homeAndAwayComplete: false,
  seasonComplete: false,
  isFinals: false,
};

// One round of the weekly league: a winner, somebody who sat it out, and
// somebody who had not joined yet.
const roundDetail = (over = {}) => ({
  season: 2026,
  league: "pool",
  name: "Round Pool League",
  type: "weekly",
  round: 12,
  status: "scored",
  startRound: 1,
  pays: true,
  buyIn: 10,
  entrants: 2,
  share: 2,
  winners: ["ann"],
  standings: [
    {
      user: "u1",
      username: "ann",
      status: "entered",
      rank: 1,
      tied: false,
      won: true,
      winnings: 2,
      topEightSelection: "Geelong",
      bottomTenSelection: "Carlton",
      topEightCorrect: 1,
      bottomTenCorrect: 0,
      marginTopEight: 18,
      marginBottomTen: 0,
      correctTips: 1,
      marginError: 4,
    },
    {
      user: "u2",
      username: "bob",
      status: "entered",
      rank: 2,
      tied: false,
      won: false,
      winnings: 0,
      topEightSelection: "Sydney",
      bottomTenSelection: "Essendon",
      topEightCorrect: 0,
      bottomTenCorrect: 1,
      marginTopEight: 0,
      marginBottomTen: 30,
      correctTips: 1,
      marginError: 25,
    },
    {
      user: "u3",
      username: "cat",
      status: "noTip",
      rank: null,
      won: false,
      winnings: 0,
      correctTips: null,
      marginError: null,
    },
    {
      user: "u4",
      username: "dan",
      status: "beforeYou",
      joinedAtRound: 20,
      rank: null,
      won: false,
      winnings: 0,
      correctTips: null,
      marginError: null,
    },
  ],
  ...over,
});

const seasonStandings = {
  season: 2026,
  buyIn: 10,
  standings: [
    { user: "u1", username: "ann", rank: 1, entries: 12, winnings: 4, net: -8 },
    { user: "u2", username: "bob", rank: 2, entries: 12, winnings: 2, net: -10 },
  ],
};

const draw = (search = "") =>
  render(
    <MemoryRouter initialEntries={[`/leaderboard${search}`]}>
      <SeasonContext.Provider
        value={{ seasonState, availableSeasons: [2026], isLoadingSeason: false }}
      >
        <Leaderboard />
      </SeasonContext.Provider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.mine.mockResolvedValue({ data: { leagues: [WEEKLY, SEASON_LEAGUE] } });
  LeagueAPI.round.mockResolvedValue({ data: roundDetail() });
  LeagueAPI.standings.mockResolvedValue({ data: seasonStandings });
  LeagueAPI.global.mockResolvedValue({ data: seasonStandings });
});

describe("which view a league opens on", () => {
  // A weekly league is a fresh contest every round with its own pool, so the
  // round is the thing and the season table is a summary of it.
  test("a weekly league opens on the round", async () => {
    draw("?league=pool");

    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());
    expect(LeagueAPI.standings).not.toHaveBeenCalled();
  });

  // A season league is one contest running all year, so its table is the
  // answer and a round is a detail of it.
  test("a season league opens on the season", async () => {
    draw("?league=ladder");

    await waitFor(() => expect(LeagueAPI.standings).toHaveBeenCalled());
    expect(LeagueAPI.round).not.toHaveBeenCalled();
  });

  // The home page already shows everyone's tips for a round; a second copy
  // behind this picker would be the same table twice.
  test("the site ladder has no round view at all", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    draw();

    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Round" })
    ).not.toBeInTheDocument();
  });
});

// The seam this file exists for: a toggle that renders correctly and changes
// nothing would look right in a screenshot.
describe("the toggle changes what is asked for", () => {
  test("switching to Season fetches the season table", async () => {
    draw("?league=pool");
    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Season" }));

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("pool", 2026)
    );
  });

  test("and back to Round fetches the round again", async () => {
    draw("?league=ladder");
    await waitFor(() => expect(LeagueAPI.standings).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Round" }));

    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());
  });
});

// The other seam: a picker whose value never reaches the request.
describe("the round picker drives the request", () => {
  test("it opens on the last round played", async () => {
    draw("?league=pool");

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 12, 2026)
    );
  });

  test("stepping back asks for the round before", async () => {
    draw("?league=pool");
    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole("button", { name: /^Previous round/ })
    );

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 11, 2026)
    );
  });
});

// And the third: a table reading fields the server does not send, or ignoring
// ones it does.
describe("what the round table shows", () => {
  const rowFor = (name) => screen.getByText(name).closest("tr");

  test("each pick with its margin against it", async () => {
    draw("?league=pool");
    await screen.findByText(/ann/);

    const ann = within(rowFor("1. ann"));
    expect(ann.getByText(/Geelong \(18\)/)).toBeInTheDocument();
    expect(ann.getByText(/Carlton/)).toBeInTheDocument();

    // The margin sits against whichever pick was given one, and only one of
    // the two ever carries it.
    const bob = within(rowFor("2. bob"));
    expect(bob.getByText(/Essendon \(30\)/)).toBeInTheDocument();
    expect(bob.getByText(/Sydney/)).toBeInTheDocument();
  });

  // Colour alone does not carry this - red against green is the pair most
  // people with colour blindness cannot separate.
  test("a tip that came off is marked as well as tinted", async () => {
    draw("?league=pool");
    await screen.findByText(/ann/);

    const ann = within(rowFor("1. ann"));
    expect(ann.getByText("Correct")).toBeInTheDocument();
    expect(ann.getByText("Incorrect")).toBeInTheDocument();
  });

  test("the winner is paid in money, not in buy-in units", async () => {
    draw("?league=pool");
    await screen.findByText(/ann/);

    // Two entrants at a $10 buy-in is a share of 2, which is $20.
    expect(within(rowFor("1. ann")).getByText("$20")).toBeInTheDocument();
  });

  // Missing a round is a free pass in this competition - nothing goes in,
  // nothing can be won - so it must not read as having come last.
  test("somebody who sat the round out has no placing", async () => {
    draw("?league=pool");
    await screen.findByText(/cat/);

    expect(screen.getByText("did not enter")).toBeInTheDocument();
    expect(screen.queryByText("3. cat")).not.toBeInTheDocument();
  });

  // A different absence, and the difference matters to the reader.
  test("somebody who joined later says when", async () => {
    draw("?league=pool");
    await screen.findByText(/dan/);

    expect(screen.getByText("joined at round 20")).toBeInTheDocument();
  });
});

describe("a season league's round", () => {
  const seasonRound = roundDetail({
    league: "ladder",
    name: "Season League",
    type: "season",
    pays: false,
    buyIn: undefined,
    winners: [],
    share: 0,
    standings: roundDetail().standings.map((s) => ({
      ...s,
      won: false,
      winnings: 0,
    })),
  });

  // A season league has no pool, so a money column on one would be inventing
  // an amount nobody staked.
  test("has no money column at all", async () => {
    LeagueAPI.round.mockResolvedValue({ data: seasonRound });
    draw("?league=ladder");

    // The toggle only exists once the leagues have arrived and a league has
    // been chosen; clicking before that finds nothing.
    await userEvent.click(await screen.findByRole("button", { name: "Round" }));
    await screen.findByText(/ann/);

    expect(screen.queryByRole("columnheader", { name: "Won" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});

// The other half of the page. The round view got the attention because it was
// the new thing, which left the table that has been there all along untested.
describe("what the season table shows", () => {
  const rowFor = (name) => screen.getByText(name).closest("tr");

  // Everything is stored in buy-in units, so every figure here is a
  // multiplication - and getting one of them wrong is how "won 3" appeared
  // beside a $10 buy-in on the home page.
  test("a weekly league counts entries, winnings and balance in money", async () => {
    draw("?league=pool");
    await userEvent.click(await screen.findByRole("button", { name: "Season" }));

    const ann = within(await screen.findByText("1. ann").then((el) => el.closest("tr")));
    // 12 entries at $10, $40 won, so $80 down.
    expect(ann.getByText("12 ($120)")).toBeInTheDocument();
    expect(ann.getByText("$40")).toBeInTheDocument();
    expect(ann.getByText("-$80")).toBeInTheDocument();
  });

  // The balance column once read "$-15": the dollar sign was literal text and
  // the minus came back with the number, so the sign landed between them.
  test("a negative balance puts the minus in front of the sign", async () => {
    draw("?league=pool");
    await userEvent.click(await screen.findByRole("button", { name: "Season" }));
    await screen.findByText("1. ann");

    expect(screen.queryByText(/\$-/)).not.toBeInTheDocument();
  });

  // A season league is ranked on tips and margin, not on money, so it gets
  // different columns entirely.
  test("a season league counts rounds and a total, not money", async () => {
    LeagueAPI.standings.mockResolvedValue({
      data: {
        season: 2026,
        standings: [
          { user: "u1", username: "ann", rank: 1, roundsTipped: 12, correctTips: 18, marginError: 240 },
        ],
      },
    });
    draw("?league=ladder");

    expect(await screen.findByText("1. ann")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rounds" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    // The margin only separates ties, which is why it is in brackets beside
    // the figure it breaks rather than in a column of its own.
    expect(screen.getByText("18 (240)")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Winnings" })).not.toBeInTheDocument();
  });

  test("the site ladder is ranked the same way as a season league", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    LeagueAPI.global.mockResolvedValue({
      data: {
        season: 2026,
        standings: [
          { user: "u1", username: "ann", rank: 1, roundsTipped: 20, correctTips: 30, marginError: 500 },
        ],
      },
    });
    draw();

    expect(await screen.findByText("Overall Site Ladder")).toBeInTheDocument();
    expect(screen.getByText("30 (500)")).toBeInTheDocument();
  });
});

describe("rounds the league has nothing to say about", () => {
  test("a round before the league existed says so", async () => {
    LeagueAPI.round.mockResolvedValue({
      data: roundDetail({ status: "beforeLeague", startRound: 20, standings: [] }),
    });
    draw("?league=pool");

    expect(
      await screen.findByText("This league started at round 20.")
    ).toBeInTheDocument();
  });

  test("a round nobody entered is not a round anyone lost", async () => {
    LeagueAPI.round.mockResolvedValue({
      data: roundDetail({ status: "noEntries", entrants: 0, winners: [], standings: [] }),
    });
    draw("?league=pool");

    expect(await screen.findByText("Nobody entered this round.")).toBeInTheDocument();
  });
});

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

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import { SeasonContext } from "../../utils/SeasonContext";
import { AuthContext } from "../../utils/AuthContext";
import LeagueAPI from "../../utils/LeagueAPI";
import Leaderboard from "./index";

vi.mock("../../utils/LeagueAPI", () => ({
  default: {
    mine: vi.fn(),
    standings: vi.fn(),
    global: vi.fn(),
    globalRound: vi.fn(),
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

// One round of the Overall Site Ladder, in the shape a league's round comes
// back in. The differences are the two the page reads: a pool with no buy-in,
// and nobody who joined late - you are on the site ladder from the day you
// register.
const siteRound = (over = {}) => ({
  season: 2026,
  round: 12,
  status: "scored",
  pays: true,
  buyIn: 0,
  entrants: 2,
  winners: ["zoe"],
  standings: [
    {
      user: "g1",
      username: "zoe",
      status: "entered",
      rank: 1,
      tied: false,
      won: true,
      winnings: 7,
      topEightSelection: "Brisbane Lions",
      bottomTenSelection: "North Melbourne",
      topEightCorrect: 1,
      bottomTenCorrect: 1,
      marginTopEight: 22,
      marginBottomTen: 0,
      correctTips: 2,
      marginError: 3,
    },
    {
      user: "g2",
      username: "quiet",
      status: "noTip",
      rank: null,
      tied: false,
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
    {
      user: "u2",
      username: "bob",
      rank: 2,
      entries: 12,
      winnings: 2,
      net: -10,
    },
  ],
};

// What the address bar would say, drawn where a test can read it.
const Address = () => (
  <output data-testid="address">{useLocation().search}</output>
);
const address = () => screen.getByTestId("address").textContent;

const draw = (search = "", state = seasonState, seasons = [2026]) =>
  render(
    withTheme(
      <MemoryRouter initialEntries={[`/leaderboard${search}`]}>
        <SeasonContext.Provider
          value={{
            seasonState: state,
            availableSeasons: seasons,
            isLoadingSeason: false,
          }}
        >
          <Leaderboard />
          <Address />
        </SeasonContext.Provider>
      </MemoryRouter>
    )
  );

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.mine.mockResolvedValue({
    data: { leagues: [WEEKLY, SEASON_LEAGUE] },
  });
  LeagueAPI.round.mockResolvedValue({ data: roundDetail() });
  LeagueAPI.standings.mockResolvedValue({ data: seasonStandings });
  LeagueAPI.global.mockResolvedValue({ data: seasonStandings });
  LeagueAPI.globalRound.mockResolvedValue({ data: siteRound() });
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

  // One contest running all year, like a season league - so the season table is
  // the answer and a round is a detail of it. Unlike a season league it does
  // pay a pool each round, which is why the round is worth having at all.
  test("the site ladder opens on the season", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    draw();

    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    expect(LeagueAPI.globalRound).not.toHaveBeenCalled();
  });

  // Above the ladder, not under it: under it, a new player met it below all
  // 22 rows of the site ladder (UX audit finding #8).
  test("somebody in no league is told so before the table", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    draw();

    const prompt = await screen.findByText("You are not in a league yet.");
    const table = await screen.findByRole("table");
    expect(
      prompt.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test("and offers a round view beside it", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    draw();

    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Round" })).toBeInTheDocument();
  });
});

// The site ladder's round, which is the same question a league's round asks,
// over everybody. It is drawn with the same table, so what is worth testing is
// the two places the two differ.
describe("one round of the site ladder", () => {
  const openSiteRound = async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    draw();

    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Round" }));
    await waitFor(() => expect(LeagueAPI.globalRound).toHaveBeenCalled());
  };

  test("the toggle asks the server for it", async () => {
    await openSiteRound();

    expect(LeagueAPI.globalRound).toHaveBeenCalledWith(12, 2026);
    expect(LeagueAPI.round).not.toHaveBeenCalled();
  });

  test("everyone's picks are drawn, and the winner marked", async () => {
    await openSiteRound();

    expect(
      await screen.findByText(/Brisbane Lions \(22\)/)
    ).toBeInTheDocument();
    expect(screen.getByText(/North Melbourne/)).toBeInTheDocument();
    expect(screen.getByText(/1\. zoe/)).toBeInTheDocument();
  });

  test("somebody who sat it out is said to have, not placed", async () => {
    await openSiteRound();

    expect(await screen.findByText("did not enter")).toBeInTheDocument();
  });

  // The reason pays and buyIn are two fields. The site pool has a winner worth
  // marking and no dollar value to put against it, and multiplying the share by
  // a buy-in of zero would print $0.00 beside the person who won it.
  test("no money column, though the round does pay", async () => {
    await openSiteRound();

    expect(
      await screen.findByText(/Brisbane Lions \(22\)/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Won")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  // The other half of that: a league with a buy-in still shows what was won.
  test("a league's round still shows the money", async () => {
    draw("?league=pool");

    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());
    expect(await screen.findByText("Won")).toBeInTheDocument();
  });

  // Before the first bounce the server sends no picks at all - see
  // services/globalLadder.round.test.js. The table still has to draw.
  test("a round with nothing revealed yet still renders", async () => {
    LeagueAPI.globalRound.mockResolvedValue({
      data: siteRound({
        winners: [],
        standings: siteRound().standings.map((row) => ({
          ...row,
          rank: null,
          tied: false,
          won: false,
          winnings: 0,
          topEightSelection: null,
          bottomTenSelection: null,
          marginTopEight: null,
          marginBottomTen: null,
          correctTips: null,
          marginError: null,
          status: "entered",
        })),
      }),
    });

    await openSiteRound();

    expect(await screen.findByText(/zoe/)).toBeInTheDocument();
    expect(screen.queryByText(/Brisbane Lions/)).not.toBeInTheDocument();
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

// On a phone (review finding #28). Measured on the live site at 375px, the
// round table was 392px wide in a 311px box: it scrolled sideways with nothing
// saying so, "Won" started 21px past the right edge, "Top 8 tip" wrapped onto
// three lines and "did not enter" was cut to "did". Below the sm breakpoint it
// is three columns instead: the player, both picks stacked, and the result.
describe("the round table on a phone", () => {
  const cellsOf = (name) => [
    ...screen.getByText(name).closest("tr").querySelectorAll("td"),
  ];

  beforeEach(() => {
    // What MUI's useMediaQuery asks of the browser. Only the sm breakpoint's
    // "narrower than" query matches, which is what a phone answers.
    window.matchMedia = (query) => ({
      matches: /max-width:\s*599\.95px/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  });
  afterEach(() => {
    delete window.matchMedia;
  });

  test("it is three columns", async () => {
    draw("?league=pool");
    await screen.findByText("1. ann");

    const headers = [
      ...screen.getByText("1. ann").closest("table").querySelectorAll("th"),
    ];
    expect(headers.map((th) => th.textContent)).toEqual([
      "Player",
      "Top 8 / Bottom 10",
      "Result",
    ]);
    expect(cellsOf("1. ann")).toHaveLength(3);
  });

  test("both picks share a cell, each with its margin and its mark", async () => {
    draw("?league=pool");
    await screen.findByText("1. ann");

    const tips = within(cellsOf("1. ann")[1]);
    expect(tips.getByText(/Geelong \(18\)/)).toBeInTheDocument();
    expect(tips.getByText(/Carlton/)).toBeInTheDocument();
    expect(tips.getByText("Correct")).toBeInTheDocument();
    expect(tips.getByText("Incorrect")).toBeInTheDocument();
  });

  // The column that was off the edge of the screen.
  test("the money sits in the result, under the correct tips", async () => {
    draw("?league=pool");
    await screen.findByText("1. ann");

    const result = cellsOf("1. ann")[2];
    expect(result).toHaveTextContent("1 (4)");
    expect(result).toHaveTextContent("$20");
  });

  test("somebody who sat it out gets the rest of the row to say so", async () => {
    draw("?league=pool");
    await screen.findByText("did not enter");

    const cell = screen.getByText("did not enter").closest("td");
    expect(cell).toHaveAttribute("colspan", "2");
  });

  // The pool's money table was four columns and 403px wide in a 311px box,
  // with Balance - who is up and who is down - scrolled out of sight (UX
  // audit finding #7). On a phone the entries go under the name.
  test("the money table keeps Balance on screen", async () => {
    draw("?league=pool");
    await userEvent.click(
      await screen.findByRole("button", { name: "Season" })
    );
    await screen.findByText("Winnings");

    const table = screen.getByRole("table");
    expect(
      [...table.querySelectorAll("th")].map((th) => th.textContent)
    ).toEqual(["Player", "Winnings", "Balance"]);

    const ann = screen.getByText(/1\. ann/).closest("tr");
    const cells = [...ann.querySelectorAll("td")];
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveTextContent("12 entries · $120");
    expect(cells[2]).toHaveTextContent("-$80");
  });

  // The site ladder's round pays nothing to show, so there is no money line.
  test("a round with no money to show has none", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    draw();
    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Round" }));
    await screen.findByText("1. zoe");

    const result = cellsOf("1. zoe")[2];
    expect(result).toHaveTextContent("2 (3)");
    expect(result).not.toHaveTextContent("$");
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

    expect(
      screen.queryByRole("columnheader", { name: "Won" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});

// The other half of the page. The round view got the attention because it was
// the new thing, which left the table that has been there all along untested.
describe("what the season table shows", () => {
  // Everything is stored in buy-in units, so every figure here is a
  // multiplication - and getting one of them wrong is how "won 3" appeared
  // beside a $10 buy-in on the home page.
  test("a weekly league counts entries, winnings and balance in money", async () => {
    draw("?league=pool");
    await userEvent.click(
      await screen.findByRole("button", { name: "Season" })
    );

    const ann = within(
      await screen.findByText("1. ann").then((el) => el.closest("tr"))
    );
    // 12 entries at $10, $40 won, so $80 down.
    expect(ann.getByText("12 ($120)")).toBeInTheDocument();
    expect(ann.getByText("$40")).toBeInTheDocument();
    expect(ann.getByText("-$80")).toBeInTheDocument();
  });

  // The balance column once read "$-15": the dollar sign was literal text and
  // the minus came back with the number, so the sign landed between them.
  test("a negative balance puts the minus in front of the sign", async () => {
    draw("?league=pool");
    await userEvent.click(
      await screen.findByRole("button", { name: "Season" })
    );
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
          {
            user: "u1",
            username: "ann",
            rank: 1,
            roundsTipped: 12,
            correctTips: 18,
            marginError: 240,
          },
        ],
      },
    });
    draw("?league=ladder");

    expect(await screen.findByText("1. ann")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Rounds" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Correct (off by)" })
    ).toBeInTheDocument();
    // The margin only separates ties, which is why it is in brackets beside
    // the figure it breaks rather than in a column of its own.
    expect(screen.getByText("18 (240)")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Winnings" })
    ).not.toBeInTheDocument();
  });

  test("the site ladder is ranked the same way as a season league", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    LeagueAPI.global.mockResolvedValue({
      data: {
        season: 2026,
        standings: [
          {
            user: "u1",
            username: "ann",
            rank: 1,
            roundsTipped: 20,
            correctTips: 30,
            marginError: 500,
          },
        ],
      },
    });
    draw();

    expect(await screen.findByText("Overall Site Ladder")).toBeInTheDocument();
    expect(screen.getByText("30 (500)")).toBeInTheDocument();
  });
});

// Nothing marked your own row, so you hunted for your username - in a
// 12-person pool, or the 23-person site ladder (UX audit finding #9).
describe("your own row", () => {
  // Drawn as bob, who came second in the round and did not win it.
  const drawAs = (id, search) =>
    render(
      withTheme(
        <MemoryRouter initialEntries={[`/leaderboard${search}`]}>
          <AuthContext.Provider
            value={{
              user: { id, name: "bob", isAuthenticated: true },
              setUser: vi.fn(),
              checked: true,
            }}
          >
            <SeasonContext.Provider
              value={{
                seasonState,
                availableSeasons: [2026],
                isLoadingSeason: false,
              }}
            >
              <Leaderboard />
            </SeasonContext.Provider>
          </AuthContext.Provider>
        </MemoryRouter>
      )
    );

  const rowOf = (name) => screen.getByText(name).closest("tr");

  test("in a round, it is washed and your name is bold", async () => {
    drawAs("u2", "?league=pool");
    await screen.findByText("bob");

    expect(rowOf("bob")).toHaveStyle({
      backgroundColor: "rgba(0, 59, 145, 0.07)",
    });
    expect(screen.getByText("bob")).toHaveStyle({ fontWeight: 700 });
    // Said to a screen reader too, which cannot see a tint.
    expect(within(rowOf("bob")).getByText("(you)")).toBeInTheDocument();
    // Nobody else's.
    expect(within(rowOf("cat")).queryByText("(you)")).not.toBeInTheDocument();
  });

  // A winner's row keeps its gold: winning says more.
  test("a round you won keeps the winner's gold", async () => {
    drawAs("u1", "?league=pool");
    await screen.findByText("ann");

    expect(rowOf("ann")).toHaveStyle({ backgroundColor: "#fffaf0" });
    expect(within(rowOf("ann")).getByText("(you)")).toBeInTheDocument();
  });

  test("over a season, it says where you are before the rows", async () => {
    drawAs("u2", "?league=pool");
    await userEvent.click(
      await screen.findByRole("button", { name: "Season" })
    );

    expect(await screen.findByText("You: 2nd of 2")).toBeInTheDocument();
    expect(rowOf("bob")).toHaveStyle({
      backgroundColor: "rgba(0, 59, 145, 0.07)",
    });
  });
});

describe("rounds the league has nothing to say about", () => {
  test("a round before the league existed says so", async () => {
    LeagueAPI.round.mockResolvedValue({
      data: roundDetail({
        status: "beforeLeague",
        startRound: 20,
        standings: [],
      }),
    });
    draw("?league=pool");

    expect(
      await screen.findByText("This league started at round 20.")
    ).toBeInTheDocument();
  });

  // Not started: the picks are hidden, and a row says only whether they are
  // in yet. It said "did not enter" for everyone who hadn't tipped - up to
  // the bounce (UX audit finding #5).
  test("a round not started says who has tipped, not who missed it", async () => {
    const hidden = (row) => ({
      ...row,
      rank: null,
      tied: false,
      won: false,
      winnings: 0,
      topEightSelection: null,
      bottomTenSelection: null,
      topEightCorrect: null,
      bottomTenCorrect: null,
      marginTopEight: null,
      marginBottomTen: null,
      correctTips: null,
      marginError: null,
    });
    const base = roundDetail();
    LeagueAPI.round.mockResolvedValue({
      data: {
        ...base,
        status: "open",
        winners: [],
        share: 0,
        entrants: 1,
        members: 3,
        standings: [hidden(base.standings[0]), base.standings[2]],
      },
    });
    draw("?league=pool");

    expect(
      await screen.findByText(
        /Round 12 hasn't started\. 1 of 3 have tipped so far, and everyone's picks are shown at the first bounce\./
      )
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("tipped")).toBeInTheDocument();
    expect(within(table).getByText("not tipped yet")).toBeInTheDocument();
    expect(within(table).queryByText("did not enter")).not.toBeInTheDocument();
  });

  // Under way: the server sends the picks but no places and no money, and
  // the table says why rather than showing a column of "=1." and an equal
  // share of the pool against every name (UX audit finding #2).
  test("a round still being played says so, and places nobody", async () => {
    const underWay = (row) => ({
      ...row,
      rank: null,
      tied: false,
      won: false,
      winnings: 0,
      topEightCorrect: null,
      bottomTenCorrect: null,
      correctTips: null,
      marginError: null,
    });
    const base = roundDetail();
    LeagueAPI.round.mockResolvedValue({
      data: {
        ...base,
        status: "pending",
        winners: [],
        share: 0,
        standings: [underWay(base.standings[0]), underWay(base.standings[1])],
      },
    });
    draw("?league=pool");

    expect(
      await screen.findByText(
        /Round 12 is still being played\. Places and winnings are worked out once every game is over\./
      )
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText(/Geelong/)).toBeInTheDocument();
    expect(within(table).queryByText(/^1\. /)).not.toBeInTheDocument();
    expect(within(table).queryByText(/\$\d/)).not.toBeInTheDocument();
  });

  test("a round nobody entered is not a round anyone lost", async () => {
    LeagueAPI.round.mockResolvedValue({
      data: roundDetail({
        status: "noEntries",
        entrants: 0,
        winners: [],
        standings: [],
      }),
    });
    draw("?league=pool");

    expect(
      await screen.findByText("Nobody entered this round.")
    ).toBeInTheDocument();
  });
});

// Which ladder the page opens on, which is a question the URL gets to answer.
//
// The home page's Overall Site Ladder row used to link to a bare /leaderboard
// and land on a league, because that is what the bare URL means. Both halves
// are tested here: the default that made it wrong, and the parameter that
// makes it right.
// Review finding #29, seen on the live site: the empty site ladder said
// "Nothing to show for 2026 yet" after the season had ended, under a subtitle,
// "Everyone in Twin Tips", that stopped being true once the ladder began
// leaving out people who had never tipped - and the "N of M signed up" line
// was missing in exactly the case it helps most.
describe("what the site ladder says about itself", () => {
  const emptySite = { season: 2026, standings: [], registered: 8 };

  test("it is everyone who has tipped, not everyone", async () => {
    draw("?ladder=site");

    expect(
      await screen.findByText("Everyone who has tipped this season")
    ).toBeInTheDocument();
    expect(screen.queryByText("Everyone in Twin Tips")).not.toBeInTheDocument();
  });

  test("empty after the season, it says nobody tipped rather than 'yet'", async () => {
    LeagueAPI.global.mockResolvedValue({ data: emptySite });
    draw("?ladder=site", { ...seasonState, homeAndAwayComplete: true });

    expect(
      await screen.findByText("No tips were entered in 2026.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/yet/)).not.toBeInTheDocument();
  });

  test("empty mid-season, it is still to come", async () => {
    LeagueAPI.global.mockResolvedValue({ data: emptySite });
    draw("?ladder=site");

    expect(
      await screen.findByText("Nothing to show for 2026 yet.")
    ).toBeInTheDocument();
  });

  test("and either way it says how many have signed up", async () => {
    LeagueAPI.global.mockResolvedValue({ data: emptySite });
    draw("?ladder=site", { ...seasonState, homeAndAwayComplete: true });

    expect(
      await screen.findByText("0 of 8 signed up have tipped in 2026.")
    ).toBeInTheDocument();
  });

  test("as it does above a ladder with people on it", async () => {
    LeagueAPI.global.mockResolvedValue({
      data: { ...seasonStandings, registered: 8 },
    });
    draw("?ladder=site");

    expect(
      await screen.findByText("2 of 8 signed up have tipped in 2026.")
    ).toBeInTheDocument();
  });
});

describe("which ladder the URL asks for", () => {
  test("a bare URL opens on the league you have been in longest", async () => {
    draw();

    // The weekly league is first in `mine`, and a weekly league opens on its
    // round - so this is that league's table, not the site ladder's.
    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());
    expect(LeagueAPI.global).not.toHaveBeenCalled();
  });

  test("ladder=site opens on the site ladder instead", async () => {
    draw("?ladder=site");

    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    expect(LeagueAPI.round).not.toHaveBeenCalled();
    expect(LeagueAPI.standings).not.toHaveBeenCalled();
  });

  test("and says so in the heading", async () => {
    draw("?ladder=site");

    expect(await screen.findByText("Overall Site Ladder")).toBeInTheDocument();
  });

  // A league named in the URL still wins, which is how "See the standings" on
  // a league's own page opens on that one.
  test("a named league still beats it", async () => {
    draw("?league=ladder&ladder=site");

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("ladder", 2026)
    );
    expect(LeagueAPI.global).not.toHaveBeenCalled();
  });

  // Its own parameter, because a league called Global would take the slug that
  // a reserved ?league= value would have needed.
  test("a league whose slug is global is a league, not the site ladder", async () => {
    LeagueAPI.mine.mockResolvedValue({
      data: { leagues: [{ slug: "global", name: "Global", type: "season" }] },
    });

    draw("?league=global");

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("global", 2026)
    );
    expect(LeagueAPI.global).not.toHaveBeenCalled();
  });
});

// UX audit finding #10: it opened on last week's round while a round was being
// played, on round 24 once the season was over, and said /leaderboard whatever
// was on screen.
describe("where the ladder opens", () => {
  test("a round being played is the round it opens on", async () => {
    draw("?league=pool", { ...seasonState, roundStarted: true, lockout: true });

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 13, 2026)
    );
    expect(LeagueAPI.round).not.toHaveBeenCalledWith("pool", 12, 2026);
  });

  // The final standings are the answer once Twin Tips is over for the year.
  test("once Twin Tips is over, a weekly league opens on its season", async () => {
    draw("?league=pool", {
      ...seasonState,
      currentRound: 24,
      lastCompletedRound: 24,
      homeAndAwayComplete: true,
    });

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("pool", 2026)
    );
    expect(LeagueAPI.round).not.toHaveBeenCalled();
  });

  test("and says so in the address only when asked for otherwise", async () => {
    draw("?league=pool", {
      ...seasonState,
      currentRound: 24,
      lastCompletedRound: 24,
      homeAndAwayComplete: true,
    });
    await waitFor(() => expect(LeagueAPI.standings).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Round" }));

    await waitFor(() => expect(address()).toBe("?league=pool&view=round"));
  });
});

describe("the address says what is on screen", () => {
  test("a bare address gains the ladder it opened on", async () => {
    draw();

    await waitFor(() => expect(address()).toBe("?league=pool"));
  });

  test("a round picked is written into it", async () => {
    draw("?league=pool");
    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole("button", { name: /^Previous round/ })
    );

    await waitFor(() => expect(address()).toBe("?league=pool&round=11"));
  });

  test("and so is a view that is not the one the ladder opens on", async () => {
    draw("?league=pool");
    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Season" }));

    await waitFor(() => expect(address()).toBe("?league=pool&view=season"));
  });

  // Read back as somebody arriving, it fetched the leagues again and put the
  // view back to the league's own - so a pick undid itself a moment later.
  test("writing it is not arriving again, so a pick stays picked", async () => {
    draw("?league=pool");
    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Season" }));
    await waitFor(() => expect(LeagueAPI.standings).toHaveBeenCalled());

    expect(LeagueAPI.mine).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Season" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(address()).toBe("?league=pool&view=season");
  });

  test("another ladder picked from the menu replaces the league", async () => {
    draw("?league=pool&round=11");
    await waitFor(() => expect(LeagueAPI.round).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole("button", { name: "Round Pool League" })
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Overall Site Ladder" })
    );

    await waitFor(() => expect(address()).toBe("?ladder=site"));
  });

  test("an earlier season is written; this one is not", async () => {
    draw("?league=ladder", seasonState, [2026, 2025]);
    await waitFor(() => expect(LeagueAPI.standings).toHaveBeenCalled());
    expect(address()).toBe("?league=ladder");

    await userEvent.click(screen.getByRole("combobox", { name: "Season" }));
    await userEvent.click(screen.getByRole("option", { name: "2025" }));

    await waitFor(() => expect(address()).toBe("?league=ladder&season=2025"));
  });
});

// The other half: a link, a bookmark or a refresh opens on what it says.
describe("an address opens on what it says", () => {
  test("its round", async () => {
    draw("?league=pool&round=11");

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 11, 2026)
    );
    expect(LeagueAPI.round).not.toHaveBeenCalledWith("pool", 12, 2026);
    expect(address()).toBe("?league=pool&round=11");
  });

  test("its view", async () => {
    draw("?league=pool&view=season");

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("pool", 2026)
    );
    expect(LeagueAPI.round).not.toHaveBeenCalled();
  });

  test("its season", async () => {
    draw("?league=ladder&season=2025", seasonState, [2026, 2025]);

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("ladder", 2025)
    );
    expect(LeagueAPI.standings).not.toHaveBeenCalledWith("ladder", 2026);
  });

  // For the ladder it arrived with. Another ladder opens on its own view.
  test("a view asked for is let go when the ladder changes", async () => {
    draw("?league=ladder&view=round");
    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("ladder", 12, 2026)
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Season League" })
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Overall Site Ladder" })
    );

    // The site ladder's own view, the season, so the address has none to add.
    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    await waitFor(() => expect(address()).toBe("?ladder=site"));
  });

  test("a round there is not opens on one there is", async () => {
    draw("?league=pool&round=99");

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 12, 2026)
    );
    expect(LeagueAPI.round).not.toHaveBeenCalledWith("pool", 99, 2026);
    await waitFor(() => expect(address()).toBe("?league=pool"));
  });

  // Not round 11, which is what reading the digits off the front would give.
  test("as does a round that is not a number", async () => {
    draw("?league=pool&round=11abc");

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 12, 2026)
    );
    expect(LeagueAPI.round).not.toHaveBeenCalledWith("pool", 11, 2026);
  });

  test("and a view there is not opens on the ladder's own", async () => {
    draw("?league=pool&view=table");

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 12, 2026)
    );
    await waitFor(() => expect(address()).toBe("?league=pool"));
  });

  test("and a season there is not opens on this one", async () => {
    draw("?league=ladder&season=1999", seasonState, [2026, 2025]);

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("ladder", 2026)
    );
    await waitFor(() => expect(address()).toBe("?league=ladder"));
  });
});

// UX audit finding #11. With the server out of reach, the page said "Could
// not reach the server" and, under it, "You are not in a league yet" - to
// somebody in six leagues, with a button to create a seventh.
describe("when your leagues do not load", () => {
  // No response at all, which is what axios gives when the server cannot be
  // reached.
  const offline = () => new Error("Network Error");

  test("it does not say you are in no league", async () => {
    LeagueAPI.mine.mockRejectedValue(offline());
    draw();

    expect(
      await screen.findByText("Your leagues did not load")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You are not in a league yet.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create a league" })
    ).not.toBeInTheDocument();
  });

  // The site ladder stands in, but the address still names the league asked
  // for - so Try again and a refresh can still find it.
  test("the address keeps the league it asked for", async () => {
    LeagueAPI.mine.mockRejectedValue(offline());
    draw("?league=ladder");

    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalled());
    expect(address()).toBe("?league=ladder");
  });

  test("Try again asks once more, and opens on the league asked for", async () => {
    LeagueAPI.mine.mockRejectedValueOnce(offline());
    draw("?league=ladder");
    await screen.findByText("Your leagues did not load");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(LeagueAPI.standings).toHaveBeenCalledWith("ladder", 2026)
    );
    expect(
      screen.queryByText("Your leagues did not load")
    ).not.toBeInTheDocument();
  });

  // The site ladder was standing in, not chosen, so it gives way.
  test("with nothing asked for, Try again opens on your first league", async () => {
    LeagueAPI.mine.mockRejectedValueOnce(offline());
    draw();
    await screen.findByText("Your leagues did not load");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(LeagueAPI.round).toHaveBeenCalledWith("pool", 12, 2026)
    );
    await waitFor(() => expect(address()).toBe("?league=pool"));
  });

  // The table usually failed for the same reason, and asking only for the
  // list would leave it saying so.
  test("Try again asks for the table again too", async () => {
    LeagueAPI.mine.mockRejectedValueOnce(offline());
    LeagueAPI.global.mockRejectedValueOnce(offline());
    draw("?ladder=site");
    await screen.findByText("Your leagues did not load");
    expect(LeagueAPI.global).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(LeagueAPI.global).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByText(/Could not reach the server/)
    ).not.toBeInTheDocument();
  });
});

// UX audit finding #17. The page had no heading at all - the league name is a
// menu button - and that button's accessible name was "Ladder", so a screen
// reader never said which league was showing.
describe("what a screen reader is told the page is", () => {
  test("the ladder's name is the page's heading", async () => {
    draw("?league=ladder");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Season League" })
    ).toBeInTheDocument();
  });

  test("and the menu button is named for the ladder showing", async () => {
    draw("?ladder=site");

    const button = await screen.findByRole("button", {
      name: "Overall Site Ladder",
    });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(
      screen.queryByRole("button", { name: "Ladder" })
    ).not.toBeInTheDocument();
  });

  test("and follows the ladder when another is picked", async () => {
    draw("?league=ladder");
    await userEvent.click(
      await screen.findByRole("button", { name: "Season League" })
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Round Pool League" })
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Round Pool League",
      })
    ).toBeInTheDocument();
  });
});

// UX audit finding #13. "2 (4)", "Brisbane Lions (39)", "14.5 (517)" and
// "$100" were printed with nothing saying what the half, the two brackets or
// the money meant. Each table now has a line under it that does.
describe("every table says what its numbers are", () => {
  test("a round: the margin tipped, and how far it missed", async () => {
    draw("?league=pool");

    expect(
      await screen.findByText(/how far that margin missed/)
    ).toBeInTheDocument();
    expect(screen.getByText(/a draw is/)).toBeInTheDocument();
  });

  // The money is the pool won, not profit.
  test("a paying round says the money is the pool before the buy-in", async () => {
    draw("?league=pool");

    expect(
      await screen.findByText(/before their own buy-in/)
    ).toBeInTheDocument();
  });

  test("a round with no money column says nothing of money", async () => {
    LeagueAPI.mine.mockResolvedValue({ data: { leagues: [] } });
    draw("?ladder=site&view=round");

    await screen.findByText(/how far that margin missed/);
    expect(screen.queryByText(/buy-in/)).not.toBeInTheDocument();
  });

  // Before the bounce the rows say only who has tipped - no figures to key.
  test("a round not started has no key", async () => {
    LeagueAPI.round.mockResolvedValue({
      data: { ...roundDetail(), status: "open", members: 4 },
    });
    draw("?league=pool");

    await screen.findByText(/hasn't started/);
    expect(
      screen.queryByText(/how far that margin missed/)
    ).not.toBeInTheDocument();
  });

  test("a round before the league began has no key", async () => {
    LeagueAPI.round.mockResolvedValue({
      data: { ...roundDetail(), status: "beforeLeague", startRound: 20 },
    });
    draw("?league=pool");

    await screen.findByText(/This league started at round 20/);
    expect(
      screen.queryByText(/how far that margin missed/)
    ).not.toBeInTheDocument();
  });

  test("a season ladder: the season's tips and margins added up", async () => {
    draw("?league=ladder");

    expect(
      await screen.findByText(/every round's margin miss added up/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Correct (off by)" })
    ).toBeInTheDocument();
  });

  test("a pool's season: what winnings and balance are", async () => {
    draw("?league=pool&view=season");

    expect(
      await screen.findByText(/Balance is winnings less what was paid in/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/every round's margin miss added up/)
    ).not.toBeInTheDocument();
  });

  // "margin" read as the margin itself; the bracket is how far it missed.
  test("the round's column says off by, not margin", async () => {
    draw("?league=pool");

    expect(
      await screen.findByRole("columnheader", { name: "Correct (off by)" })
    ).toBeInTheDocument();
  });
});

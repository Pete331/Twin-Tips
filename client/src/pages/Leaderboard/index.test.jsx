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

import { withTheme } from "../../testTheme";
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
    { user: "u2", username: "bob", rank: 2, entries: 12, winnings: 2, net: -10 },
  ],
};

const draw = (search = "") =>
  render(
    withTheme(
      <MemoryRouter initialEntries={[`/leaderboard${search}`]}>
        <SeasonContext.Provider
          value={{ seasonState, availableSeasons: [2026], isLoadingSeason: false }}
        >
          <Leaderboard />
        </SeasonContext.Provider>
      </MemoryRouter>
    )
  );

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.mine.mockResolvedValue({ data: { leagues: [WEEKLY, SEASON_LEAGUE] } });
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

    expect(await screen.findByText(/Brisbane Lions \(22\)/)).toBeInTheDocument();
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

    expect(await screen.findByText(/Brisbane Lions \(22\)/)).toBeInTheDocument();
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

// Which ladder the page opens on, which is a question the URL gets to answer.
//
// The home page's Overall Site Ladder row used to link to a bare /leaderboard
// and land on a league, because that is what the bare URL means. Both halves
// are tested here: the default that made it wrong, and the parameter that
// makes it right.
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

// The tips page, rendered.
//
// This is where the bug that prompted page-level tests actually lived. The live
// quarter clock was added to FixtureCard and to FixtureCenterCard, both were
// tested, every test passed, and nothing appeared on the page - because this
// file was never changed to pass `timestr` down. Twenty component tests stepped
// straight over the one line that was missing.
//
// So the point here is the wiring and the rules, not the arithmetic:
//
//   - the round it opens on, and the picker reaching the request
//   - every prop a fixture needs arriving at the card
//   - the competition's rules: two teams, one margin, and the deadline
//   - what is actually posted when Submit is pressed
//
// TipsAPI is stubbed. What the server does with that payload is held to
// account by routes/tips.route.test.js against a real database.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import API from "../../utils/TipsAPI";
import TipsPage from "./index";

vi.mock("../../utils/TipsAPI", () => ({
  default: {
    getRoundDetails: vi.fn(),
    getModels: vi.fn(),
    getOdds: vi.fn(),
    getCurrentRoundTips: vi.fn(),
    getPreviousRoundTips: vi.fn(),
    postTips: vi.fn(),
  },
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

// Mid-season, round 12 open for tipping.
const openState = (over = {}) => ({
  season: 2026,
  currentRound: 12,
  lastCompletedRound: 11,
  lastHomeAndAwayRound: 24,
  roundName: "Round 12",
  roundNames: { 11: "Round 11", 12: "Round 12", 13: "Round 13" },
  rounds: [11, 12, 13],
  tippingOpen: true,
  roundStarted: false,
  lockout: false,
  isFinals: false,
  homeAndAwayComplete: false,
  seasonComplete: false,
  ladderReady: true,
  ladderStale: false,
  ladderProvisional: false,
  lockoutAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  serverTime: new Date().toISOString(),
  ...over,
});

// A fixture in the shape GET /api/roundDetails returns: the populated team
// documents and the ladder attached as single-element arrays, which is what
// the page reads as game["home-team-standing"][0].rank.
const fixture = (over = {}) => ({
  id: 101,
  year: 2026,
  round: 12,
  venue: "Adelaide Oval",
  date: "2026-06-13T09:20:00.000Z",
  hteam: "Adelaide",
  ateam: "Melbourne",
  hteamid: 1,
  ateamid: 11,
  complete: 0,
  hscore: 0,
  ascore: 0,
  winner: null,
  timestr: null,
  "home-team": [{ abbrev: "ADEL", logo: "adel.svg" }],
  "away-team": [{ abbrev: "MELB", logo: "melb.svg" }],
  "home-team-standing": [{ rank: 3 }],
  "away-team-standing": [{ rank: 14 }],
  ...over,
});

// The rule is one team from each half of the ladder, from two different
// matches - so a round needs at least two games before a legal tip exists.
const second = (over = {}) =>
  fixture({
    id: 102,
    hteam: "Geelong",
    ateam: "Richmond",
    hteamid: 6,
    ateamid: 14,
    venue: "M.C.G.",
    "home-team": [{ abbrev: "GEEL" }],
    "away-team": [{ abbrev: "RICH" }],
    "home-team-standing": [{ rank: 5 }],
    "away-team-standing": [{ rank: 12 }],
    ...over,
  });

const draw = (state = openState()) => {
  const user = { id: "u1", name: "ann", isAuthenticated: true };
  return render(
    withTheme(
      <MemoryRouter>
        <AuthContext.Provider value={{ user, setUser: vi.fn(), checked: true }}>
          <SeasonContext.Provider
            value={{ seasonState: state, availableSeasons: [2026] }}
          >
            <TipsPage />
          </SeasonContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );
};

// The checkbox for a side, by its accessible name - which is how assistive
// technology finds it, and therefore what a regression should break.
const checkboxFor = (team) =>
  screen.getByRole("checkbox", { name: new RegExp(team) });

beforeEach(() => {
  vi.clearAllMocks();
  API.getRoundDetails.mockResolvedValue({ data: [fixture(), second()] });
  API.getModels.mockResolvedValue({ data: { tips: [] } });
  API.getOdds.mockResolvedValue({ data: { games: {} } });
  API.getCurrentRoundTips.mockResolvedValue({ data: null });
  API.getPreviousRoundTips.mockResolvedValue({ data: null });
  API.postTips.mockResolvedValue({ data: { success: true } });
});

describe("which round it opens on", () => {
  test("the round being tipped, while tipping is open", async () => {
    draw();
    await waitFor(() => expect(API.getRoundDetails).toHaveBeenCalledWith(12));
  });

  // The one time the current round is the interesting one even though tipping
  // has shut: a game is on.
  test("a round in progress, not last week's results", async () => {
    draw(openState({ tippingOpen: false, roundStarted: true, lockout: true }));
    await waitFor(() => expect(API.getRoundDetails).toHaveBeenCalledWith(12));
  });

  // Everything else is a results view. currentRound has already rolled forward
  // while the ladder catches up, and an unplayed round reading 0-0 in every
  // game is not what somebody who just watched the football came for.
  test("otherwise the last round actually played", async () => {
    draw(openState({ tippingOpen: false, roundStarted: false, lockout: true }));
    await waitFor(() => expect(API.getRoundDetails).toHaveBeenCalledWith(11));
  });

  test("the picker asks for the round it moves to", async () => {
    draw();
    await waitFor(() => expect(API.getRoundDetails).toHaveBeenCalledWith(12));

    await userEvent.click(
      screen.getAllByRole("button", { name: /^Previous round/ })[0]
    );

    await waitFor(() => expect(API.getRoundDetails).toHaveBeenCalledWith(11));
  });
});

// The seam that broke. Each of these is a prop the card reads and the page has
// to pass, and a component test of the card cannot see any of them missing.
describe("what reaches the fixture card", () => {
  test("the teams, their ladder positions and the ground", async () => {
    draw();

    expect(await screen.findByAltText("Adelaide")).toBeInTheDocument();
    expect(screen.getByAltText("Melbourne")).toBeInTheDocument();
    expect(screen.getByText(/Adelaide Oval/)).toBeInTheDocument();
    // 3rd and 14th, from the standings attached to the fixture.
    expect(screen.getByText("3rd")).toBeInTheDocument();
    expect(screen.getByText("14th")).toBeInTheDocument();
  });

  // The bug itself, as a test. Squiggle sends timestr on a game in progress and
  // it has to travel page -> card -> centre card to be seen.
  test("the live clock, on a game being played", async () => {
    API.getRoundDetails.mockResolvedValue({
      data: [fixture({ complete: 40, hscore: 50, ascore: 30, timestr: "Q2 14:44" })],
    });
    draw(openState({ tippingOpen: false, roundStarted: true, lockout: true }));

    expect(await screen.findByText("Q2 14:44")).toBeInTheDocument();
    // It replaces the ground and start time while the game is on.
    expect(screen.queryByText(/Adelaide Oval/)).not.toBeInTheDocument();
  });

  test("and not on a game that has finished", async () => {
    API.getRoundDetails.mockResolvedValue({
      data: [
        fixture({ complete: 100, hscore: 100, ascore: 80, timestr: "Full Time" }),
      ],
    });
    draw(openState({ tippingOpen: false, roundStarted: false, lockout: true }));

    expect(await screen.findByText(/Adelaide Oval/)).toBeInTheDocument();
    expect(screen.queryByText("Full Time")).not.toBeInTheDocument();
  });

  // A team tipped last round cannot be picked again, and the page is what
  // fetches last round's picks and hands them down.
  test("last round's selections, so they cannot be picked twice", async () => {
    API.getPreviousRoundTips.mockResolvedValue({
      data: { topEightSelection: "Adelaide", bottomTenSelection: "Richmond" },
    });
    draw();

    await waitFor(() => expect(checkboxFor("Adelaide")).toBeDisabled());
    expect(checkboxFor("Melbourne")).toBeEnabled();
  });

  // Saved tips come back checked, which is what makes the page an edit rather
  // than a fresh form.
  test("tips already saved for this round come back selected", async () => {
    API.getCurrentRoundTips.mockResolvedValue({
      data: {
        topEightSelection: "Adelaide",
        bottomTenSelection: "Richmond",
        marginTopEight: 20,
        marginBottomTen: 0,
      },
    });
    draw();

    await waitFor(() => expect(checkboxFor("Adelaide")).toBeChecked());
    expect(checkboxFor("Richmond")).toBeChecked();
  });
});

describe("the rules of the competition", () => {
  test("two teams are needed before anything is posted", async () => {
    draw();
    await screen.findByAltText("Adelaide");

    await userEvent.click(checkboxFor("Adelaide"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("You need to select 2 teams")).toBeInTheDocument();
    expect(API.postTips).not.toHaveBeenCalled();
  });

  // A margin on one of the two games. Zero is not a margin - that would be
  // predicting a draw, which the competition does not offer.
  test("a margin is needed on one of the games", async () => {
    draw();
    await screen.findByAltText("Adelaide");

    await userEvent.click(checkboxFor("Adelaide"));
    await userEvent.click(checkboxFor("Richmond"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(
      await screen.findByText("You need to enter a margin for one of the games")
    ).toBeInTheDocument();
    expect(API.postTips).not.toHaveBeenCalled();
  });

  // The deadline. It is enforced on the server too, but a form that still looks
  // fillable after the first bounce is how somebody believes they have tipped.
  test("no checkboxes once the round has started", async () => {
    draw(openState({ tippingOpen: false, roundStarted: true, lockout: true }));
    await screen.findByAltText("Adelaide");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("what gets posted", () => {
  const fillIn = async () => {
    await screen.findByAltText("Adelaide");
    await userEvent.click(checkboxFor("Adelaide"));
    await userEvent.click(checkboxFor("Richmond"));

    await userEvent.type(screen.getAllByLabelText("Margin")[0], "18");
  };

  test("the picks, the margin, the round and the season", async () => {
    draw();
    await fillIn();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(API.postTips).toHaveBeenCalled());

    const sent = API.postTips.mock.calls[0][0];
    expect(sent.topEightSelection).toBe("Adelaide");
    expect(sent.bottomTenSelection).toBe("Richmond");
    expect(sent.round).toBe(12);
    // Taken from the fixture rather than from the clock, so a tip filed in
    // January cannot land in the wrong year.
    expect(sent.season).toBe(2026);
    expect(sent.user).toBe("u1");
  });

  // The margin goes on exactly one of the two, and the other is cleared -
  // otherwise moving a prediction to the other game leaves a stale one behind
  // and the document ends up holding both.
  test("only one margin is carried", async () => {
    draw();
    await fillIn();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(API.postTips).toHaveBeenCalled());

    const sent = API.postTips.mock.calls[0][0];
    const margins = [sent.marginTopEight, sent.marginBottomTen].filter(
      (m) => m && m !== "0"
    );
    expect(margins).toHaveLength(1);
  });

  test("a successful submission leaves the page", async () => {
    draw();
    await fillIn();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/home", expect.anything()));
  });

  // The quietest failure in the app: pressing Submit and having the request
  // fail used to do nothing at all - no message, no navigation, nothing on
  // screen changed.
  test("a failed submission says so rather than going quiet", async () => {
    API.postTips.mockRejectedValue({ response: { status: 500 } });
    draw();
    await fillIn();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(navigate).not.toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

// Predictions and prices are decoration. A round Squiggle has no tips for, or
// an odds table that fails to load, must not take the fixtures down with it.
describe("the nice-to-haves stay nice to have", () => {
  test("fixtures still render when the model has nothing to say", async () => {
    API.getModels.mockRejectedValue(new Error("no tips for this round"));
    draw();

    expect(await screen.findByAltText("Adelaide")).toBeInTheDocument();
  });

  test("fixtures still render when the odds fail", async () => {
    API.getOdds.mockRejectedValue(new Error("odds unavailable"));
    draw();

    expect(await screen.findByAltText("Adelaide")).toBeInTheDocument();
  });
});

// The line, all the way from the odds request to the card.
//
// It rides on the object the prices already travel on, so there is no separate
// prop for this page to forget to pass - which is exactly how the live clock
// was added to two components, tested in both, and never appeared. That is the
// reason this test exists even though the wiring cannot break the same way.
describe("the bookmakers' line reaches the card", () => {
  const gameOdds = (line) => ({
    data: {
      games: {
        101: {
          home: { best: 1.46, average: 1.44, bookmaker: "SportsBet", count: 7 },
          away: { best: 2.9, average: 2.8, bookmaker: "TAB", count: 7 },
          line,
          fetchedAt: new Date().toISOString(),
        },
      },
    },
  });

  test("named on the favoured side", async () => {
    API.getOdds.mockResolvedValue(
      gameOdds({ point: -21.5, count: 7, low: -21.5, high: -20.5 })
    );

    draw();

    expect(await screen.findByText(/Line: ADEL by 21.5/)).toBeInTheDocument();
  });

  // Adelaide are at home in this fixture, so a positive line is Melbourne's.
  test("and on the other side when the sign turns over", async () => {
    API.getOdds.mockResolvedValue(
      gameOdds({ point: 12.5, count: 7, low: 12.5, high: 12.5 })
    );

    draw();

    expect(await screen.findByText(/Line: MELB by 12.5/)).toBeInTheDocument();
  });

  // A round the books have not set a line on, which is every round until they
  // do. The rest of the card must still draw.
  test("a round with no line still renders the fixture", async () => {
    API.getOdds.mockResolvedValue(gameOdds({ point: null, count: 0 }));

    draw();

    expect(await screen.findByAltText("Adelaide")).toBeInTheDocument();
    expect(screen.queryByText(/Line:/)).not.toBeInTheDocument();
  });
});

// One heading level at a time.
//
// The day headings are h3, which is right when the panel above them carries an
// h2 - and this branch of the page had none, so it ran h1 straight to h3. A
// screen reader user navigating by heading meets the gap and cannot tell
// whether they have missed a section.
test("the headings step down one level at a time", async () => {
  draw();
  await screen.findByAltText("Adelaide");

  const levels = screen
    .getAllByRole("heading")
    .map((h) => Number(h.tagName[1]));

  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i += 1) {
    expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  }
});

// The round, named once for the outline. Hidden, because the countdown above
// already says it and the picker below sets it.
test("and the level between them names the round", async () => {
  draw();
  await screen.findByAltText("Adelaide");

  expect(
    screen.getByRole("heading", { level: 2, name: "Round 12" })
  ).toBeInTheDocument();
});

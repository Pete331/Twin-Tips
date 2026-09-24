// Squiggle's prediction, which is a link out to somebody else's model.
//
// It had no test at all, which is how it came to be written twice: a ternary
// whose two arms were the same anchor around the same Typography, differing
// only in which abbreviation and which percentage went inside. Collapsing it
// to one is the change these cover, and a refactor with nothing holding it is
// a rewrite with extra steps.
//
// Two things are worth pinning beyond "it renders". Which side gets named,
// because Squiggle reports one confidence and the other is inferred from it.
// And the rounding, which is uneven on purpose and looks exactly like a bug to
// anybody tidying up.

import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import FixtureCard from "./index";

// Not yet played, which is the only state the prediction is drawn in - a game
// with a result gets its score instead, and FixtureCard does not even pass the
// model results down that branch.
const card = (over = {}) => ({
  id: 101,
  venue: "Adelaide Oval",
  hteam: "Adelaide",
  ateam: "Melbourne",
  habrev: "ADEL",
  aabrev: "MELB",
  hteamrank: 3,
  ateamrank: 14,
  complete: 0,
  hscore: 0,
  ascore: 0,
  date: "2026-06-13T09:20:00.000Z",
  round: 12,
  currentRound: 12,
  lockout: false,
  handleSelectionChange: () => {},
  ...over,
});

// Squiggle's shape: one row a game, keyed by the same id the fixture carries.
const model = (over = {}) => [
  { gameid: 101, hconfidence: 62.4, margin: 11.6, ...over },
];

const draw = (over) => render(withTheme(<FixtureCard {...card(over)} />));

describe("the model's pick", () => {
  test("names the home side when it is favoured, with the margin", () => {
    draw({ modelResults: model() });

    expect(screen.getByText(/ADEL \(62%\) by 12/)).toBeInTheDocument();
  });

  // The away side's confidence is not reported. It is a hundred minus the
  // home side's, which is the whole reason this line ever had two arms.
  test("and the away side when it is", () => {
    draw({ modelResults: model({ hconfidence: 37.6, margin: 11.6 }) });

    expect(screen.getByText(/MELB \(62%\) by 12/)).toBeInTheDocument();
  });

  // A coin toss used to land on the away side, since it had to land
  // somewhere - which is how the Grand Final read "FRE (50%) by 0" on the live
  // site (review finding #29): a pick that picks nobody. When the model cannot
  // split them, it says so.
  test("says it is too close to call when the model cannot split them", () => {
    draw({ modelResults: model({ hconfidence: 50 }) });

    expect(screen.getByText("Too close to call")).toBeInTheDocument();
    expect(screen.queryByText(/MELB \(50%\)/)).not.toBeInTheDocument();
  });

  // What is shown is what is judged: a confidence that rounds to 50, or a
  // margin that rounds to nothing, is a pick nobody could act on.
  test("and when either figure only rounds to a coin toss", () => {
    draw({ modelResults: model({ hconfidence: 50.4 }) });
    expect(screen.getByText("Too close to call")).toBeInTheDocument();
  });

  test("and when the margin rounds to nothing", () => {
    draw({ modelResults: model({ hconfidence: 56, margin: 0.4 }) });
    expect(screen.getByText("Too close to call")).toBeInTheDocument();
  });

  test("but not when it clears either", () => {
    draw({ modelResults: model({ hconfidence: 50.6, margin: 0.6 }) });
    expect(screen.getByText(/ADEL \(51%\) by 1/)).toBeInTheDocument();
  });

  test("and it still links to the game on Squiggle", () => {
    draw({ modelResults: model({ hconfidence: 50 }) });
    expect(screen.getByText("Too close to call").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("squiggle.com.au/game/")
    );
  });

  // The uneven rounding, kept deliberately.
  //
  // The home side rounds its own figure; the away side subtracts the rounded
  // home figure rather than rounding the difference. At exactly x.5 those
  // disagree - here 100 - round(47.5) is 52, where round(100 - 47.5) would be
  // 53. This is a link through to Squiggle's own page, so it should say what
  // Squiggle says rather than a number half a point away that reads neater.
  //
  // Without this test, "tidying" the two into one rounding looks like a pure
  // simplification and changes what the page reports.
  test("rounds the away side from the home figure, not from the difference", () => {
    draw({ modelResults: model({ hconfidence: 47.5 }) });

    expect(screen.getByText(/MELB \(52%\)/)).toBeInTheDocument();
    expect(screen.queryByText(/MELB \(53%\)/)).not.toBeInTheDocument();
  });

  test("links to that game on Squiggle", () => {
    draw({ modelResults: model() });

    expect(screen.getByRole("link", { name: /ADEL/ })).toHaveAttribute(
      "href",
      "https://squiggle.com.au/game/?gid=101"
    );
  });

  // A final whose sides are not decided yet has no prediction to show, and
  // would otherwise advertise "(100%) by 0" against two blank teams.
  test("says nothing about a game Squiggle has no prediction for", () => {
    draw({ modelResults: [{ gameid: 999, hconfidence: 80, margin: 30 }] });

    expect(screen.queryByText(/%\) by/)).not.toBeInTheDocument();
  });

  test("and nothing at all when no model results arrive", () => {
    draw({ modelResults: undefined });

    expect(screen.queryByText(/%\) by/)).not.toBeInTheDocument();
  });
});

// The unit is gone, and this is what says so out loud.
//
// Every other margin on the site goes without one - the result on this same
// card reads "ADE by 56", the leaderboard reads "Adelaide (24)" - because in
// football a margin is points. This line was the only place that spelled it,
// on the only line already carrying a second number in brackets, and it is
// the string the wrap rule in FixtureCenterCard is written around.
describe("the margin's unit", () => {
  test("is not spelled out", () => {
    draw({ modelResults: model() });

    expect(screen.queryByText(/points/i)).not.toBeInTheDocument();
  });

  test("and the prediction reads the way the result does", () => {
    draw({ modelResults: model() });

    // "SIDE (n%) by n", matching "SIDE by n" - same sentence, same ending.
    expect(screen.getByText(/^ADEL \(62%\) by 12$/)).toBeInTheDocument();
  });
});

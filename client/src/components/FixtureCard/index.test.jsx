// FixtureCard is where the competition's rules meet the screen.
//
// A tipster picks one team from the top 8 and one from the bottom 10, cannot
// reuse either of last round's picks, and cannot tip at all once the round has
// started. Every one of those rules is a prop on this component deciding
// whether a checkbox exists, whether it is disabled, and what colour the card
// behind it is. Until now none of it was tested by anything but a person
// clicking on it.
//
// Two of the cases below are past bugs with comments in the source explaining
// them: an undecided finals side printing "NaN" where the ladder position goes,
// and a level game in progress being announced as "*Carlton by 0".

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FixtureCard from "./index";
import { GREEN, RED } from "../../utils/resultTint";

// A round-12 fixture between a top-8 side and a bottom-10 side, not yet played.
// Each test overrides only the prop it is about.
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

const draw = (over) => render(<FixtureCard {...card(over)} />);

// The CardContent behind a team carries the ladder tint as an inline colour.
// Found through the logo's alt text, which is the team name, so the query does
// not depend on how the surrounding markup is nested.
const panelFor = (team) =>
  screen.getByAltText(team).closest(".MuiCardContent-root");

// The checkbox for a side, found by its name attribute.
//
// Deliberately not getByRole("checkbox", { name }): these checkboxes have no
// accessible name. FormControlLabel is given a control and no label, so the
// only thing tying a checkbox to its team is the HTML name attribute, which
// assistive technology does not read - a screen reader announces "checkbox,
// unchecked" twice and never says which side is which. Written this way so the
// tests describe what the component does today rather than failing on a
// separate defect; fixing that is a change to the component, not to its tests.
const checkboxFor = (team) =>
  document.querySelector(`input[type="checkbox"][name="${team}"]`);

describe("who can be picked", () => {
  test("both sides offer a checkbox in the current round", () => {
    draw();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  // The rule that stops somebody tipping the same side two weeks running. It is
  // enforced on the server too, but a disabled checkbox is the only thing that
  // explains it before they try.
  test("a team tipped last round cannot be picked again", () => {
    draw({ lastRoundSelectionT8: "Adelaide" });

    expect(checkboxFor("Adelaide")).toBeDisabled();
    expect(checkboxFor("Melbourne")).toBeEnabled();
  });

  test("the bottom-ten pick from last round is blocked the same way", () => {
    draw({ lastRoundSelectionB10: "Melbourne" });

    expect(checkboxFor("Melbourne")).toBeDisabled();
    expect(checkboxFor("Adelaide")).toBeEnabled();
  });

  test("a current selection shows as checked", () => {
    draw({ topEightSelection: "Adelaide", bottomTenSelection: "Melbourne" });

    expect(checkboxFor("Adelaide")).toBeChecked();
    expect(checkboxFor("Melbourne")).toBeChecked();
  });

  test("picking a side reports the team by name", async () => {
    const onChange = vi.fn();
    draw({ handleSelectionChange: onChange });

    await userEvent.click(checkboxFor("Adelaide"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.name).toBe("Adelaide");
  });
});

describe("when tipping is shut", () => {
  // Lockout is the round-level deadline at the first bounce. The checkboxes
  // have to go, not just stop working: a form that still looks fillable after
  // the deadline is how somebody believes they have tipped when they have not.
  test("no checkbox survives the lockout", () => {
    draw({ lockout: true });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  // Every other round is a results view, not a form.
  test("a round that is not the current one offers no checkbox", () => {
    draw({ round: 11, currentRound: 12 });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("which half of the ladder a side is in", () => {
  test("a top-eight side is tinted green and a bottom-ten side red", () => {
    draw();

    expect(panelFor("Adelaide")).toHaveStyle({ backgroundColor: GREEN });
    expect(panelFor("Melbourne")).toHaveStyle({ backgroundColor: RED });
  });

  // Eighth is in the top eight. An off-by-one here moves a side between the two
  // groups, which changes who is eligible for which pick.
  test("eighth is top eight and ninth is not", () => {
    draw({ hteamrank: 8, ateamrank: 9 });

    expect(panelFor("Adelaide")).toHaveStyle({ backgroundColor: GREEN });
    expect(panelFor("Melbourne")).toHaveStyle({ backgroundColor: RED });
  });

  // The tint says which group you would pick this side from, so it means
  // nothing on a round nobody is tipping.
  test("no tint on a round that is not being tipped", () => {
    draw({ round: 11, currentRound: 12 });

    expect(panelFor("Adelaide")).not.toHaveStyle({ backgroundColor: GREEN });
    expect(panelFor("Melbourne")).not.toHaveStyle({ backgroundColor: RED });
  });

  // Squiggle stops reporting a rank once the finals begin, so a named side can
  // have no ladder position. Neither comparison should hold.
  test("a side with no rank takes no colour", () => {
    draw({ hteamrank: undefined, ateamrank: undefined });

    expect(panelFor("Adelaide")).not.toHaveStyle({ backgroundColor: GREEN });
    expect(panelFor("Adelaide")).not.toHaveStyle({ backgroundColor: RED });
  });
});

describe("a finals fixture whose sides are not known yet", () => {
  const undecided = { hteam: "", ateam: "", habrev: "", aabrev: "" };

  test("the card still renders, naming neither side", () => {
    draw(undecided);

    expect(screen.getAllByText("To be decided")).toHaveLength(2);
  });

  test("no logo is requested for a side that does not exist", () => {
    draw(undecided);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // The bug getOrdinalNum was rewritten for. undefined fell through to indexing
  // the suffix array with NaN, and undefined + undefined is the string "NaN",
  // so the card printed "NaN" where the ladder position goes.
  test("an unranked side shows no ladder position rather than NaN", () => {
    draw({ ...undecided, hteamrank: undefined, ateamrank: undefined });

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  test("a rank of zero is not a ladder position either", () => {
    draw({ hteamrank: 0, ateamrank: 0 });

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText("0th")).not.toBeInTheDocument();
  });
});

describe("what the middle of the card says about the score", () => {
  const played = { complete: 100, hscore: 100, ascore: 80, winner: "ADEL" };

  test("a finished game names the winner and the margin", () => {
    draw(played);
    expect(screen.getByText("ADEL by 20")).toBeInTheDocument();
  });

  test("a finished game level on the scoreboard is a draw", () => {
    draw({ ...played, hscore: 90, ascore: 90, winner: "" });
    expect(screen.getByText("Draw")).toBeInTheDocument();
  });

  test("a game in progress marks the leader with a star", () => {
    draw({ complete: 40, hscore: 50, ascore: 30, winner: "ADEL" });
    expect(screen.getByText("*Adelaide by 20")).toBeInTheDocument();
  });

  // The bug this case exists for: the only comparison was whether home was
  // ahead, so a level game in progress fell through to the away branch and read
  // "*Melbourne by 0" - a side announced as leading by nothing.
  test("a game in progress with the scores level says so", () => {
    draw({ complete: 40, hscore: 22, ascore: 22, winner: "" });

    expect(screen.getByText("*Scores level")).toBeInTheDocument();
    expect(screen.queryByText(/by 0$/)).not.toBeInTheDocument();
  });
});

// The card is built around a fixture existing. Without this guard the page
// rendered an empty div and the finals disappeared from the calendar.
test("nothing renders without a fixture id", () => {
  const { container } = render(<FixtureCard {...card({ id: undefined })} />);
  expect(container.textContent).toBe("");
});

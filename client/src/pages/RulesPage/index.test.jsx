// The rules page, which is where the competition is written down.
//
// It had no test at all, and it has just been rebuilt from one panel of prose
// into three - which is exactly the change that drops a rule without anybody
// noticing. Nothing here is about how it looks; it is about every rule still
// being on the page, in a list, under the right heading.
//
// The wording is asserted on distinctive phrases rather than whole sentences.
// A rule that gets reworded should not fail this; a rule that goes missing
// should.
//
// Roles are safe to query here because this page sets its elements explicitly -
// component="h1", component="h2", component="li". Elsewhere they are not: the
// theme maps subtitle2 to <p>, and these tests render without the theme, so
// asking for a subtitle by heading role would describe markup nobody is served.

import { describe, test, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import RulesPage from "./index";
import { WEEKLY, SEASON, typeName } from "../../utils/leagueTypes";

const draw = () => render(<RulesPage />);

// Every rule the page states, by the phrase that makes it that rule.
const TIPPING = [
  /Tip two teams to win each round/,
  /joining a second one does not mean tipping twice/,
  /One from the Top 8 and one from the Bottom 10/,
  /Add a margin to one of your two selections, not both/,
  /can.t pick the same team in consecutive rounds/,
  /Tips close when the first game of the round starts/,
  /A drawn match is worth half a win/,
  /no finals tipping/,
];

const POOL = [
  /whoever gets the most tips right/,
  /Ten players at \$5 makes a \$50 pool/,
  /takes the whole pool/,
  /the pool is split evenly between/,
];

const LADDER = [
  /correct tips build up across the season/,
  /the smallest total finishes higher/,
  /doesn.t collect or track a buy-in for this type/,
];

describe("every rule is still on the page", () => {
  test.each(TIPPING)("tipping: %s", (phrase) => {
    draw();
    expect(screen.getByText(phrase)).toBeInTheDocument();
  });

  test.each(POOL)("the pool type: %s", (phrase) => {
    draw();
    expect(screen.getByText(phrase)).toBeInTheDocument();
  });

  test.each(LADDER)("the ladder type: %s", (phrase) => {
    draw();
    expect(screen.getByText(phrase)).toBeInTheDocument();
  });
});

describe("how it is organised", () => {
  test("one page title and three named sections", () => {
    draw();

    expect(
      screen.getByRole("heading", { level: 1, name: "How to play" })
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["Tipping", "Round Pool leagues", "Season Ladder leagues"]);
  });

  // Taken from leagueTypes rather than written out again, so a rename there
  // reaches this page instead of leaving it as the one screen using the old
  // word.
  test("the type names are the ones the rest of the app uses", () => {
    draw();

    expect(
      screen.getByRole("heading", { name: `${typeName(WEEKLY)} leagues` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: `${typeName(SEASON)} leagues` })
    ).toBeInTheDocument();
  });

  // The markers are drawn rather than inherited, and list-style: none is what
  // costs a ul its semantics in Safari. The role is stated for that reason, and
  // this is what says it is still stated.
  test("the rules are in lists, and every rule is an item of one", () => {
    draw();

    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(3);

    expect(
      lists.map((list) => within(list).getAllByRole("listitem").length)
    ).toEqual([TIPPING.length, POOL.length, LADDER.length]);
  });

  // A ul may only contain li. The headings sat inside the list once, and a
  // screen reader counted one as an item - "list, 5 items" where four were
  // rules.
  test("no heading is inside a list", () => {
    draw();

    for (const list of screen.getAllByRole("list")) {
      expect(within(list).queryAllByRole("heading")).toHaveLength(0);
    }
  });
});

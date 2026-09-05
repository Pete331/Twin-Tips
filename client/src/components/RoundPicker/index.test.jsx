// The round picker: a dropdown with a step either side of it.
//
// The rule worth protecting is that the arrows move by position in the options
// list, never by round + 1. The lists are built from the season's own data - the
// tipping picker runs from the first round to the current one, the results
// picker holds every round including finals - so a number one higher is not
// guaranteed to be in the list, and landing on a value the Select has no item
// for renders it blank.
//
// Round 0 is also real: seasons with an Opening Round number it 0, so anything
// treating a round number as truthy drops it.

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RoundPicker from "./index";

const draw = (over = {}) =>
  render(
    <RoundPicker
      id="round"
      label="Round"
      value={12}
      options={[10, 11, 12, 13]}
      onChange={() => {}}
      {...over}
    />
  );

const back = () => screen.getByRole("button", { name: /^Previous round/ });
const forward = () => screen.getByRole("button", { name: /^Next round/ });

describe("stepping through rounds", () => {
  test("the arrows move one round either way", async () => {
    const onChange = vi.fn();
    draw({ onChange });

    await userEvent.click(forward());
    expect(onChange).toHaveBeenLastCalledWith(13);

    await userEvent.click(back());
    expect(onChange).toHaveBeenLastCalledWith(11);
  });

  // The case the component was written for. A results picker holding
  // [22, 23, 24, 26] has a gap where a round was renumbered or skipped, and
  // round + 1 from 24 would be 25 - which is not in the list, so the Select
  // would render blank.
  test("stepping follows the list, not the arithmetic", async () => {
    const onChange = vi.fn();
    draw({ value: 24, options: [22, 23, 24, 26], onChange });

    await userEvent.click(forward());

    expect(onChange).toHaveBeenLastCalledWith(26);
    expect(onChange).not.toHaveBeenCalledWith(25);
  });

  test("the ends of the list are dead ends", () => {
    draw({ value: 10 });
    expect(back()).toBeDisabled();
    expect(forward()).toBeEnabled();
  });

  test("and so is the other end", () => {
    draw({ value: 13 });
    expect(forward()).toBeDisabled();
    expect(back()).toBeEnabled();
  });

  // A value that is not in the list at all - which should not happen, but
  // indexOf returns -1 for it and -1 + 1 is a real index.
  test("a value outside the list does not step to a neighbour", () => {
    const onChange = vi.fn();
    draw({ value: 99, options: [10, 11, 12], onChange });

    expect(back()).toBeDisabled();
    expect(forward()).toBeDisabled();
  });
});

describe("when there is nothing to step between", () => {
  // Two dead arrows say less than none.
  test("a single round shows no arrows", () => {
    draw({ value: 1, options: [1] });
    expect(screen.queryByRole("button", { name: /round/ })).not.toBeInTheDocument();
  });

  test("the off-season shows no arrows and does not crash", () => {
    draw({ value: undefined, options: [] });
    expect(screen.queryByRole("button", { name: /round/ })).not.toBeInTheDocument();
  });
});

describe("what the arrows announce", () => {
  // Pressing an arrow leaves focus on the button while the value changes in a
  // Select nobody is focused on, so without this a screen reader gets silence.
  test("an arrow names where it goes before it goes there", () => {
    draw();

    expect(back()).toHaveAccessibleName("Previous round, Round 11");
    expect(forward()).toHaveAccessibleName("Next round, Round 13");
  });

  test("an arrow with nowhere to go names only itself", () => {
    draw({ value: 13 });
    expect(forward()).toHaveAccessibleName("Next round");
  });

  test("a custom label is used in the announcement too", () => {
    draw({
      value: 12,
      options: [11, 12, 13],
      getOptionLabel: (r) => `Week ${r}`,
    });

    expect(forward()).toHaveAccessibleName("Next round, Week 13");
  });
});

describe("round zero", () => {
  // Seasons with an Opening Round number it 0. Anything treating the round as
  // truthy drops it, and it is a round people tip in.
  test("the Opening Round is named, not numbered", async () => {
    draw({ value: 0, options: [0, 1, 2] });

    expect(screen.getByRole("combobox")).toHaveTextContent("Opening Round");
    expect(forward()).toHaveAccessibleName("Next round, Round 1");
  });

  test("stepping back to it works like any other round", async () => {
    const onChange = vi.fn();
    draw({ value: 1, options: [0, 1, 2], onChange });

    await userEvent.click(back());

    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});

describe("the dropdown itself", () => {
  test("it carries the label as its accessible name", () => {
    draw();
    expect(screen.getByRole("combobox")).toHaveAccessibleName("Round");
  });

  test("it lists every option", async () => {
    draw();
    await userEvent.click(screen.getByRole("combobox"));

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Round 10",
      "Round 11",
      "Round 12",
      "Round 13",
    ]);
  });

  test("choosing from the list reports the round", async () => {
    const onChange = vi.fn();
    draw({ onChange });

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Round 10" }));

    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  // value={undefined} on a controlled Select is React's uncontrolled warning,
  // and off-season there is no round to show. The component maps it to "", so
  // the Select stays controlled and shows nothing.
  //
  // Not toBeEmptyDOMElement: MUI puts a zero-width space in an empty Select to
  // hold its height, so the element is not literally empty. What matters is
  // that it names no round.
  test("no round selected shows no round rather than breaking", () => {
    draw({ value: undefined, options: [10, 11] });

    const combobox = screen.getByRole("combobox");
    expect(combobox).not.toHaveTextContent(/Round/);
    // No letters or digits at all - whatever MUI uses to hold the field's
    // height is not something a reader could take for a value.
    expect(combobox.textContent).not.toMatch(/[A-Za-z0-9]/);
  });
});

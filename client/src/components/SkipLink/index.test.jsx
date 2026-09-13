// The skip link.
//
// A keyboard user without a screen reader has no landmarks to jump by, so
// without this they tab the logo, three nav items, help and the account menu
// before reaching the page - on every page, every time.
//
// The thing worth holding is that it stays reachable. The obvious ways to hide
// something until it is focused - display:none, visibility:hidden - also take
// it out of the tab order, which hides it from the only people it is for.

import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import SkipLink from "./index";

const draw = () => render(withTheme(<SkipLink />));

describe("the skip link", () => {
  test("points at the main landmark", () => {
    draw();

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main"
    );
  });

  // Hidden by being moved, not by being removed. Either of the usual ways to
  // hide it would make it unfocusable, and a skip link nobody can focus is a
  // skip link that does nothing.
  test("is moved out of sight rather than taken out of the tab order", () => {
    draw();
    const link = screen.getByRole("link", { name: "Skip to content" });
    const style = getComputedStyle(link);

    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
    expect(link).not.toHaveAttribute("hidden");
    // Not removed from the order either.
    expect(link.getAttribute("tabindex")).not.toBe("-1");
  });

  test("and is off the top of the screen until then", () => {
    draw();
    const style = getComputedStyle(
      screen.getByRole("link", { name: "Skip to content" })
    );

    expect(style.position).toBe("fixed");
    expect(style.transform).toContain("translateY(-300%)");
  });
});

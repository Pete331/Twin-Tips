// The phone's navigation along the bottom of the screen.
//
// Found untested by measuring the client's coverage. Shown only below the sm
// breakpoint, which jsdom does not apply, so what is checked here is what it
// offers and marks, and that it is not there for someone signed out.

import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import BottomNav from "./index";

const draw = (path, isAuthenticated = true) =>
  render(
    withTheme(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider
          value={{ user: { isAuthenticated, name: "pete" }, checked: true }}
        >
          <BottomNav />
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

test("nothing at all for someone signed out", () => {
  const { container } = draw("/login", false);
  expect(container).toBeEmptyDOMElement();
});

test("the three pages, each where it says", () => {
  draw("/home");

  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
    "href",
    "/home"
  );
  expect(screen.getByRole("link", { name: "Tip now" })).toHaveAttribute(
    "href",
    "/tipspage"
  );
  expect(screen.getByRole("link", { name: "Leaderboard" })).toHaveAttribute(
    "href",
    "/leaderboard"
  );
});

test("the page you are on is marked, and only that one", () => {
  draw("/leaderboard");

  expect(screen.getByRole("link", { name: "Leaderboard" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
    "aria-current"
  );
});

// Old bookmarks arrive as /TipsPage.
test("whatever the capitals in the address", () => {
  draw("/TipsPage");

  expect(screen.getByRole("link", { name: "Tip now" })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

// Profile is not one of the three, so none of them is claimed.
test("on any other page, none is marked", () => {
  draw("/settings");

  for (const name of ["Home", "Tip now", "Leaderboard"]) {
    expect(screen.getByRole("link", { name })).not.toHaveAttribute(
      "aria-current"
    );
  }
});

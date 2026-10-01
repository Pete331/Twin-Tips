// The header: where the logo goes, which pages it offers, which one it says
// you are on, and the account menu - the way to your profile and the way out.
//
// Found untested by measuring the client's coverage: the header was drawn on
// every page and no test rendered it. anchors.test.jsx scans its source for
// buttons inside links, which is a different question.

import { describe, test, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import Navbar from "./index";
import { initialsFor } from "./AccountMenu";

const PETE = {
  id: "u1",
  name: "Pete_331",
  firstName: "Peter",
  lastName: "Brennan",
  isAuthenticated: true,
};
const NOBODY = { isAuthenticated: false };

const draw = (user, path = "/home") => {
  const logout = vi.fn();
  render(
    withTheme(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={{ user, logout, checked: true }}>
          <Navbar />
          <Routes>
            <Route path="*" element={<p>at: {path}</p>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );
  return { logout, header: within(screen.getByRole("navigation")) };
};

describe("signed out", () => {
  test("the logo goes to sign in, and so does the one button", () => {
    const { header } = draw(NOBODY, "/rulespage");

    expect(header.getByRole("link", { name: "Twin Tips" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  // Nothing behind a sign-in is offered to someone who has not.
  test("no pages that need an account, and no account menu", () => {
    const { header } = draw(NOBODY, "/rulespage");

    for (const name of ["Home", "Tip now", "Leaderboard"]) {
      expect(header.queryByRole("link", { name })).toBeNull();
    }
    expect(header.queryByRole("button", { name: /^Account/ })).toBeNull();
  });

  test("how to play is there either way", () => {
    const { header } = draw(NOBODY, "/login");

    expect(header.getByRole("link", { name: "How to play" })).toHaveAttribute(
      "href",
      "/rulespage"
    );
  });
});

describe("signed in", () => {
  test("the logo goes home", () => {
    const { header } = draw(PETE);

    expect(header.getByRole("link", { name: "Twin Tips" })).toHaveAttribute(
      "href",
      "/home"
    );
    expect(header.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  test("the three pages, each where it says", () => {
    const { header } = draw(PETE);

    expect(header.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/home"
    );
    expect(header.getByRole("link", { name: "Tip now" })).toHaveAttribute(
      "href",
      "/tipspage"
    );
    expect(header.getByRole("link", { name: "Leaderboard" })).toHaveAttribute(
      "href",
      "/leaderboard"
    );
  });

  // Marked for a screen reader as well as underlined, so "current page" is
  // heard and not only seen.
  test("the page you are on is marked, and only that one", () => {
    const { header } = draw(PETE, "/tipspage");

    expect(header.getByRole("link", { name: "Tip now" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(header.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  // Old bookmarks arrive as /TipsPage.
  test("whatever the capitals in the address", () => {
    const { header } = draw(PETE, "/TipsPage");

    expect(header.getByRole("link", { name: "Tip now" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("and help is marked on the rules", () => {
    const { header } = draw(PETE, "/rulespage");

    expect(header.getByRole("link", { name: "How to play" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(header.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  // A screen reader hears whose account it is; a glance sees the initials.
  test("the account button says whose it is", () => {
    const { header } = draw(PETE);

    const button = header.getByRole("button", { name: "Account: Pete_331" });
    expect(button).toHaveTextContent("PB");
  });

  test("and opens to your profile and the way out", async () => {
    const { header } = draw(PETE);
    await userEvent.click(
      header.getByRole("button", { name: "Account: Pete_331" })
    );

    const menu = within(await screen.findByRole("menu"));
    expect(menu.getByRole("menuitem", { name: "Profile" })).toHaveAttribute(
      "href",
      "/settings"
    );
    expect(menu.getByRole("menuitem", { name: "Logout" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  test("signing out signs you out", async () => {
    const { header, logout } = draw(PETE);
    await userEvent.click(
      header.getByRole("button", { name: "Account: Pete_331" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Logout" })
    );

    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe("the initials on the account button", () => {
  test("one from each name", () => {
    expect(initialsFor({ firstName: "peter", lastName: "brennan" })).toBe("PB");
  });

  test("the first name's alone if that is all there is", () => {
    expect(initialsFor({ firstName: "Peter", lastName: "  " })).toBe("P");
  });

  // An account from before names were asked for has a username and no more.
  test("the username's first letter if there is no name", () => {
    expect(initialsFor({ username: "pete_331" })).toBe("P");
  });

  test("and something rather than nothing", () => {
    expect(initialsFor({})).toBe("?");
    expect(initialsFor()).toBe("?");
  });
});

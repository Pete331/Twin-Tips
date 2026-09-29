// The first thing a friend opening an invite sees.
//
// UX audit finding #30. Sign-in and Register were the stock template: a purple
// lock icon, not a Twin Tips colour, over "Login" - the noun, used as a verb -
// and not a word about the game.

import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import LoginPage from "./index";
import RegisterPage from "../RegisterPage";

vi.mock("../../utils/AuthAPI", () => ({
  default: { login: vi.fn(), register: vi.fn() },
}));

const draw = (page) =>
  render(
    withTheme(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: { isAuthenticated: false },
            setUser: vi.fn(),
            checked: true,
          }}
        >
          {page}
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

const GAME = /Pick a Top 8 team and a Bottom 10 team each round/;

test("sign-in says what Twin Tips is, and how to find out more", () => {
  draw(<LoginPage />);

  expect(screen.getByText(GAME)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "How to play" })).toHaveAttribute(
    "href",
    "/rulespage"
  );
});

// The verb: "Sign in", as the tab title and every message say it.
test("sign-in is headed, and done, with the verb", () => {
  draw(<LoginPage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Sign in" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.queryByText("Login")).not.toBeInTheDocument();
});

// The app's own icon rather than a purple lock. Decorative: the heading beside
// it says where you are.
test("the icon is the app's, and silent", () => {
  const { container } = draw(<LoginPage />);

  const icon = container.querySelector('img[src="/assets/icon-192.png"]');
  expect(icon).not.toBeNull();
  expect(icon).toHaveAttribute("alt", "");
  expect(
    container.querySelector('[data-testid="LockOutlinedIcon"]')
  ).toBeNull();
});

test("register says the same, and signs in with the verb too", () => {
  const { container } = draw(<RegisterPage />);

  expect(screen.getByText(GAME)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Already have an account? Sign in" })
  ).toBeInTheDocument();
  expect(
    container.querySelector('img[src="/assets/icon-192.png"]')
  ).not.toBeNull();
});

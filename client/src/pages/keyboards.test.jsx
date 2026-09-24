// What a phone keyboard does to the fields people type their identity into.
//
// Checked on the live site at 375px (review finding #15): the email fields
// were plain text, so a phone offered no "@" key and capitalised the first
// letter; the username fields were autocapitalised and autocorrected - and a
// username is shown exactly as it was typed, so "Pete" became somebody's name
// for the season because the keyboard decided it. The sign-in field, which
// takes either, had the same problem. And the password rule only appeared
// after a failed submit.
//
// One file for all four forms, because it is the same rule on each: a field
// holding an address or a username is typed exactly as meant.

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../testTheme";
import { AuthContext } from "../utils/AuthContext";
import { PASSWORD_RULE } from "../utils/ValidationHelpers";
import RegisterPage from "./RegisterPage";
import LoginPage from "./LoginPage";
import ForgotPassword from "./ForgotPassword";
import SettingsPage from "./SettingsPage";

vi.mock("../utils/AuthAPI", () => ({
  default: {
    login: vi.fn(),
    register: vi.fn(),
    forgotPassword: vi.fn(),
    changeUsername: vi.fn(),
  },
}));

vi.mock("../utils/TipsAPI", () => ({
  default: {
    getTeams: vi.fn(() => Promise.resolve({ data: [] })),
    getUserDetails: vi.fn(() =>
      Promise.resolve({
        data: {
          username: "ann",
          firstName: "Ann",
          lastName: "B",
          email: "ann@x.test",
          favTeam: 1,
        },
      })
    ),
  },
}));

const draw = (page, user = { isAuthenticated: false }) =>
  render(
    withTheme(
      <MemoryRouter>
        <AuthContext.Provider value={{ user, setUser: vi.fn(), checked: true }}>
          {page}
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

// Typed as meant: no capital added, nothing "corrected", nothing underlined.
const asTyped = (input) => {
  expect(input).toHaveAttribute("autocapitalize", "none");
  expect(input).toHaveAttribute("autocorrect", "off");
  expect(input).toHaveAttribute("spellcheck", "false");
};

describe("registering", () => {
  test("the email field brings up the email keyboard, and is typed as meant", () => {
    draw(<RegisterPage />);
    const email = screen.getByLabelText(/Email Address/);

    expect(email).toHaveAttribute("type", "email");
    asTyped(email);
  });

  test("the username is typed as meant", () => {
    draw(<RegisterPage />);
    asTyped(screen.getByLabelText(/^Username/));
  });

  // Up front, not only after a failed submit.
  test("the password rule is shown before anything is submitted", () => {
    draw(<RegisterPage />);
    expect(screen.getByText(PASSWORD_RULE)).toBeInTheDocument();
  });
});

describe("signing in", () => {
  // It takes a username or an email, so it cannot be an email field - but
  // either way it is typed as meant.
  test("the username-or-email field is typed as meant", () => {
    draw(<LoginPage />);
    const field = screen.getByLabelText(/Username or Email/);

    expect(field).toHaveAttribute("type", "text");
    asTyped(field);
  });
});

describe("a forgotten password", () => {
  test("the email field brings up the email keyboard, and is typed as meant", () => {
    draw(<ForgotPassword />);
    const email = screen.getByLabelText(/Email Address/);

    expect(email).toHaveAttribute("type", "email");
    asTyped(email);
  });
});

describe("changing your username", () => {
  test("the new username is typed as meant", async () => {
    draw(<SettingsPage />, { id: "u1", name: "ann", isAuthenticated: true });
    asTyped(await screen.findByLabelText(/New username/));
  });
});

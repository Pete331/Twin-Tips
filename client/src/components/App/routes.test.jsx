// Which page each address reaches, signed in and signed out.
//
// Found untested by measuring the client's coverage: the table of routes - the
// one place that decides which pages need an account, and where the old
// addresses now lead - was never rendered by a test.
//
// The real App with its own router, and every page swapped for a stand-in
// naming itself, so what is under test is the table and not the pages.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import { SeasonContext } from "../../utils/SeasonContext";
import App from "./index";

// A page that says which it is - and, for sign in, where it was asked to send
// you back to, which the router keeps in the browser's history state.
//
// Hoisted with the mocks that use it, which run before this file's imports -
// so no JSX, whose runtime is one of them, and React is imported when a
// factory runs rather than at the top.
const { page } = vi.hoisted(() => ({
  page: async (name) => {
    const { createElement } = await import("react");
    return {
      default: function StandIn() {
        const kept = window.history.state && window.history.state.usr;
        const from = kept && kept.from && kept.from.pathname;
        return createElement(
          "p",
          null,
          `page: ${name}${from ? ` (back to ${from})` : ""}`
        );
      },
    };
  },
}));

vi.mock("../../pages/LoginPage", () => page("Sign in"));
vi.mock("../../pages/RegisterPage", () => page("Register"));
vi.mock("../../pages/HomePage", () => page("Home"));
vi.mock("../../pages/LeaguePage", () => page("League"));
vi.mock("../../pages/JoinLeague", () => page("Join"));
vi.mock("../../pages/NotFoundPage", () => page("Not found"));
vi.mock("../../pages/ForgotPassword", () => page("Forgot password"));
vi.mock("../../pages/ResetPassword", () => page("Reset password"));
vi.mock("../../pages/ConfirmEmail", () => page("Confirm email"));
vi.mock("../../pages/TipsPage", () => page("Tips"));
vi.mock("../../pages/RulesPage", () => page("Rules"));
vi.mock("../../pages/ContactPage", () => page("Contact"));
vi.mock("../../pages/SettingsPage", () => page("Settings"));
vi.mock("../../pages/Leaderboard", () => page("Leaderboard"));

const SIGNED_IN = { id: "u1", name: "pete", isAuthenticated: true };
const SIGNED_OUT = { isAuthenticated: false };

const visit = (path, user) => {
  window.history.pushState({}, "", path);
  render(
    withTheme(
      <AuthContext.Provider
        value={{ user, checked: true, refreshAuth: vi.fn(), logout: vi.fn() }}
      >
        <SeasonContext.Provider value={{ seasonState: null }}>
          <App />
        </SeasonContext.Provider>
      </AuthContext.Provider>
    )
  );
};

const showing = (name) => screen.findByText(new RegExp(`^page: ${name}`));

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

describe("open to anyone", () => {
  const PUBLIC = [
    ["/", "Sign in"],
    ["/login", "Sign in"],
    ["/register", "Register"],
    ["/forgot", "Forgot password"],
    ["/rulespage", "Rules"],
    ["/contact", "Contact"],
    // The link in the email is the proof, and it may be opened on a phone
    // that has never signed in.
    ["/reset/abc123", "Reset password"],
    ["/confirm-email/abc123", "Confirm email"],
  ];

  for (const [path, name] of PUBLIC) {
    test(`${path} is ${name}, signed out`, async () => {
      visit(path, SIGNED_OUT);
      expect(await showing(name)).toBeInTheDocument();
    });
  }
});

describe("behind sign in", () => {
  const PRIVATE = [
    ["/home", "Home"],
    ["/tipspage", "Tips"],
    ["/leaderboard", "Leaderboard"],
    ["/leagues/the-rivals", "League"],
    // An invite link: sent to sign in, then brought back to it.
    ["/join/tok123", "Join"],
    ["/settings", "Settings"],
  ];

  for (const [path, name] of PRIVATE) {
    test(`${path} is ${name}, signed in`, async () => {
      visit(path, SIGNED_IN);
      expect(await showing(name)).toBeInTheDocument();
    });

    // To sign in, remembering where you were going.
    test(`${path} sends someone signed out to sign in`, async () => {
      visit(path, SIGNED_OUT);

      expect(
        await screen.findByText(`page: Sign in (back to ${path})`)
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe("/login");
    });
  }
});

// Addresses that used to be pages, kept so bookmarks and old links still
// land somewhere - and replaced, so the old one is not left in the history.
describe("old addresses", () => {
  test("/dashboard is home now", async () => {
    visit("/dashboard", SIGNED_IN);

    expect(await showing("Home")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
  });

  test("/leagues is the leaderboard now", async () => {
    visit("/leagues", SIGNED_IN);

    expect(await showing("Leaderboard")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/leaderboard");
  });
});

test("anything else is a page that says it was not found", async () => {
  visit("/no-such-page", SIGNED_OUT);
  expect(await showing("Not found")).toBeInTheDocument();
});

// The phone's navigation is there for someone signed in and not otherwise.
// Signed in, "Tip now" is in the header and the bottom bar both.
test("the bottom navigation only when signed in", async () => {
  visit("/rulespage", SIGNED_IN);
  await showing("Rules");
  expect(screen.getAllByRole("link", { name: "Tip now" })).toHaveLength(2);
});

test("and none of it signed out", async () => {
  visit("/rulespage", SIGNED_OUT);
  await showing("Rules");
  expect(screen.queryAllByRole("link", { name: "Tip now" })).toHaveLength(0);
});

// Registering on the way to an invite.
//
// Someone new who opened an invite link was sent to sign in, followed the
// Register link, registered, was sent back to the sign-in form to type the
// password they had just chosen - and then landed on Home, the invite gone
// (UX audit finding #4). Now the invite rides along, and registering signs
// you in and carries on to it.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import API from "../../utils/AuthAPI";
import RegisterPage from "./index";
import LoginPage from "../LoginPage";

vi.mock("../../utils/AuthAPI", () => ({
  default: { register: vi.fn(), login: vi.fn(), checkAuthState: vi.fn() },
}));

// Where a page landed, and what it was told about where the visit was going.
const Landed = ({ label }) => {
  const location = useLocation();
  const from = location.state && location.state.from;
  return (
    <p>
      {label}
      {from ? ` (going to ${from.pathname})` : ""}
    </p>
  );
};

// Whole forms typed a key at a time take longer than the default five seconds.
const JOURNEY = 20000;

const INVITE = { from: { pathname: "/join/tok123" } };

const draw = (at, setUser = vi.fn()) =>
  render(
    withTheme(
      <AuthContext.Provider
        value={{ user: { isAuthenticated: false }, setUser, checked: true }}
      >
        <MemoryRouter initialEntries={[at]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/join/tok123"
              element={<Landed label="the invite" />}
            />
            <Route path="/home" element={<Landed label="home" />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )
  );

const fillIn = async () => {
  await userEvent.type(screen.getByLabelText(/First Name/), "New");
  await userEvent.type(screen.getByLabelText(/Last Name/), "Player");
  await userEvent.type(screen.getByLabelText(/Username/), "newbie");
  await userEvent.type(screen.getByLabelText(/Email Address/), "new@x.test");
  await userEvent.type(
    screen.getByLabelText(/Password/, { selector: "input" }),
    "Passw0rd1"
  );
  await userEvent.click(
    screen.getByRole("combobox", { name: /Which team do you support/ })
  );
  await userEvent.click(
    await screen.findByRole("option", { name: "Adelaide" })
  );
  await userEvent.click(screen.getByRole("button", { name: "Register" }));
};

const SIGNED_IN = {
  data: {
    success: true,
    message: "Account created. You're signed in.",
    isAuthenticated: true,
    user: "newbie",
    id: "n1",
    firstName: "New",
    lastName: "Player",
  },
};

beforeEach(() => vi.clearAllMocks());

describe("registering on the way to an invite", () => {
  // The whole journey: sent to sign in by the invite, over to Register, and
  // back to the invite once registered.
  test(
    "the sign-in page's Register link carries the invite",
    async () => {
      API.register.mockResolvedValue(SIGNED_IN);
      draw({ pathname: "/login", state: INVITE });

      await userEvent.click(
        screen.getByRole("link", { name: "Don't have an account? Register" })
      );
      await screen.findByLabelText(/First Name/);
      await fillIn();

      expect(await screen.findByText("the invite")).toBeInTheDocument();
    },
    JOURNEY
  );

  test(
    "registering signs you in and carries on to the invite",
    async () => {
      const setUser = vi.fn();
      API.register.mockResolvedValue(SIGNED_IN);
      draw({ pathname: "/register", state: INVITE }, setUser);

      await fillIn();

      expect(await screen.findByText("the invite")).toBeInTheDocument();
      expect(setUser).toHaveBeenCalledWith(
        expect.objectContaining({
          isAuthenticated: true,
          name: "newbie",
          id: "n1",
        })
      );
    },
    JOURNEY
  );

  test(
    "with nowhere in particular to go, it is Home",
    async () => {
      API.register.mockResolvedValue(SIGNED_IN);
      draw("/register");

      await fillIn();

      expect(await screen.findByText("home")).toBeInTheDocument();
    },
    JOURNEY
  );

  // The account was made but the sign-in did not happen: the sign-in form,
  // as it always was - still holding on to the invite.
  test(
    "if the sign-in did not happen, the form, still carrying the invite",
    async () => {
      const setUser = vi.fn();
      API.register.mockResolvedValue({
        data: {
          success: true,
          message: "Account created. Sign in to carry on.",
          isAuthenticated: false,
        },
      });
      API.login.mockResolvedValue({
        data: { isAuthenticated: true, user: "newbie", id: "n1" },
      });
      draw({ pathname: "/register", state: INVITE }, setUser);

      await fillIn();

      const who = await screen.findByLabelText(/Username or Email/);
      expect(setUser).not.toHaveBeenCalled();

      // And signing in there still goes on to the invite.
      await userEvent.type(who, "newbie");
      await userEvent.type(
        screen.getByLabelText(/Password/, { selector: "input" }),
        "Passw0rd1"
      );
      await userEvent.click(screen.getByRole("button", { name: "Login" }));
      expect(await screen.findByText("the invite")).toBeInTheDocument();
    },
    JOURNEY
  );
});

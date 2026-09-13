// Somebody already signed in has no business on the sign-in form.
//
// The bar above it showed their avatar and the bottom bar showed Home, Tip now
// and Leaderboard, while the page in between asked them to log in.
//
// Only the redirect is tested here. The rest of this page - validating, posting,
// what it does with the answer - is unchanged and not this file's business.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import LoginPage from "./index";

vi.mock("../../utils/AuthAPI", () => ({
  default: { login: vi.fn(), checkAuthState: vi.fn() },
}));

// Rendered inside a router carrying a /home to land on, so the redirect can be
// seen arriving rather than merely fired.
const draw = (user, checked = true) =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthContext.Provider value={{ user, setUser: vi.fn(), checked }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/home" element={<div>the dashboard</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

const SIGNED_IN = { id: "u1", name: "ann", isAuthenticated: true };
const SIGNED_OUT = { isAuthenticated: false };

beforeEach(() => vi.clearAllMocks());

describe("visiting the sign-in page", () => {
  test("signed in, you are sent to the dashboard", () => {
    draw(SIGNED_IN);

    expect(screen.getByText("the dashboard")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
  });

  test("signed out, you get the form", () => {
    draw(SIGNED_OUT);

    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    expect(screen.queryByText("the dashboard")).not.toBeInTheDocument();
  });

  // The session has to be asked about before the answer means anything. Until
  // then the user reads as signed out, and redirecting on that would bounce a
  // real visitor away from the form they came for.
  test("and before the session is known, the form stays", () => {
    draw(SIGNED_IN, false);

    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    expect(screen.queryByText("the dashboard")).not.toBeInTheDocument();
  });
});

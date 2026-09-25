// Who is signed in, asked once as the app opens - on every page.
//
// Only the private pages used to ask, so opening the site at "/" with a
// perfectly good session showed the sign-in form, and so did the installed
// app every time it started (UX audit finding #1). These render the real
// provider, the real sign-in page and the real PrivateRoute, with only the
// request itself stubbed.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";

import { withTheme } from "../testTheme";
import AuthProvider from "./AuthContext";
import PrivateRoute from "./PrivateRoute";
import LoginPage from "../pages/LoginPage";
import API from "./AuthAPI";

vi.mock("./AuthAPI", () => ({
  default: { login: vi.fn(), checkAuthState: vi.fn() },
}));

const SESSION = {
  data: { isAuthenticated: true, user: "ann", id: "u1", admin: false },
};
const NO_SESSION = { data: { isAuthenticated: false } };

const ToHome = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/home")}>go home</button>;
};

const app = (at) =>
  render(
    withTheme(
      <AuthProvider>
        <MemoryRouter initialEntries={[at]}>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/rulespage" element={<ToHome />} />
            <Route
              path="/home"
              element={
                <PrivateRoute>
                  <div>the dashboard</div>
                </PrivateRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    )
  );

beforeEach(() => vi.clearAllMocks());

describe("opening the app on a public page", () => {
  test("with a session, the front door goes straight to Home", async () => {
    API.checkAuthState.mockResolvedValue(SESSION);

    app("/");

    expect(await screen.findByText("the dashboard")).toBeInTheDocument();
  });

  test("without one, the sign-in form stays", async () => {
    API.checkAuthState.mockResolvedValue(NO_SESSION);

    app("/login");

    await waitFor(() => expect(API.checkAuthState).toHaveBeenCalled());
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    expect(screen.queryByText("the dashboard")).not.toBeInTheDocument();
  });

  test("a server that cannot be reached reads as signed out", async () => {
    API.checkAuthState.mockRejectedValue(new Error("Network Error"));

    app("/");

    await waitFor(() => expect(API.checkAuthState).toHaveBeenCalled());
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
  });
});

describe("PrivateRoute", () => {
  test("on the app's first page it waits on the one check already running", async () => {
    API.checkAuthState.mockResolvedValue(SESSION);

    app("/home");

    expect(await screen.findByText("the dashboard")).toBeInTheDocument();
    expect(API.checkAuthState).toHaveBeenCalledTimes(1);
  });

  test("on a later page it asks again, so an expired session is caught", async () => {
    API.checkAuthState.mockResolvedValue(SESSION);
    app("/rulespage");
    await waitFor(() => expect(API.checkAuthState).toHaveBeenCalledTimes(1));

    API.checkAuthState.mockResolvedValue(NO_SESSION);
    await userEvent.click(screen.getByText("go home"));

    await waitFor(() => expect(API.checkAuthState).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText(/Password/)).toBeInTheDocument();
  });
});

// Where the link sent to a new email address lands (UX audit finding #23).
// Opening it makes the change; the page says how it went.

import { StrictMode } from "react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import API from "../../utils/AuthAPI";
import ConfirmEmail from "./index";

vi.mock("../../utils/AuthAPI", () => ({
  default: { confirmEmail: vi.fn() },
}));

const draw = (isAuthenticated = false) =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/confirm-email/tok456"]}>
        <AuthContext.Provider
          value={{ user: { isAuthenticated }, setUser: vi.fn(), checked: true }}
        >
          <Routes>
            <Route path="/confirm-email/:token" element={<ConfirmEmail />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

const answered = (status, message) =>
  Object.assign(new Error(`status ${status}`), {
    response: { status, data: { message } },
  });

beforeEach(() => vi.clearAllMocks());

describe("opening the link", () => {
  test("confirms with the link's token, once", async () => {
    API.confirmEmail.mockResolvedValue({ data: { email: "pete@new.test" } });
    draw();

    await screen.findByRole("heading", { name: "Email changed" });
    expect(API.confirmEmail).toHaveBeenCalledTimes(1);
    expect(API.confirmEmail).toHaveBeenCalledWith({ token: "tok456" });
  });

  // The app runs in StrictMode, which runs this effect twice in development.
  // A second confirm finds the link used and would report it dead over the
  // top of the first one's success.
  test("and only once under StrictMode too", async () => {
    API.confirmEmail.mockResolvedValue({ data: { email: "pete@new.test" } });
    render(
      <StrictMode>
        {withTheme(
          <MemoryRouter initialEntries={["/confirm-email/tok456"]}>
            <AuthContext.Provider
              value={{
                user: { isAuthenticated: false },
                setUser: vi.fn(),
                checked: true,
              }}
            >
              <Routes>
                <Route
                  path="/confirm-email/:token"
                  element={<ConfirmEmail />}
                />
              </Routes>
            </AuthContext.Provider>
          </MemoryRouter>
        )}
      </StrictMode>
    );

    await screen.findByRole("heading", { name: "Email changed" });
    expect(API.confirmEmail).toHaveBeenCalledTimes(1);
  });

  test("says the new address once it is done", async () => {
    API.confirmEmail.mockResolvedValue({ data: { email: "pete@new.test" } });
    draw();

    expect(
      await screen.findByText(/Your email is now pete@new.test/)
    ).toBeInTheDocument();
  });

  test("signed in, the way on is Home; signed out, sign in", async () => {
    API.confirmEmail.mockResolvedValue({ data: { email: "pete@new.test" } });
    const { unmount } = draw(true);
    expect(
      await screen.findByRole("link", { name: "Go to Home" })
    ).toHaveAttribute("href", "/home");
    unmount();

    draw(false);
    expect(
      await screen.findByRole("link", { name: "Sign in" })
    ).toHaveAttribute("href", "/login");
  });

  test("an expired or used link says so, and nothing changed", async () => {
    API.confirmEmail.mockRejectedValue(answered(422));
    draw(true);

    expect(
      await screen.findByRole("heading", { name: "This link has expired" })
    ).toBeInTheDocument();
    expect(screen.getByText(/your email hasn't changed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Profile" })).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  test("an address taken since says so", async () => {
    API.confirmEmail.mockRejectedValue(
      answered(409, "That email has been taken since you asked.")
    );
    draw(true);

    expect(
      await screen.findByRole("heading", { name: "That email is taken" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("That email has been taken since you asked.")
    ).toBeInTheDocument();
  });

  test("anything else can be tried again", async () => {
    API.confirmEmail
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({ data: { email: "pete@new.test" } });
    draw();

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" })
    );

    await waitFor(() => expect(API.confirmEmail).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("heading", { name: "Email changed" })
    ).toBeInTheDocument();
  });
});

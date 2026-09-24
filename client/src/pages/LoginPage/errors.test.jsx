// What the sign-in page says when sign-in is refused.
//
// A 429 - too many tries from this address, or now at this account - fell
// through to "Oops, something went wrong", so somebody waiting out a limit was
// never told there was one, or how long it had to run.

import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import API from "../../utils/AuthAPI";
import LoginPage from "./index";

vi.mock("../../utils/AuthAPI", () => ({ default: { login: vi.fn() } }));

const draw = () =>
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
          <LoginPage />
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

const signIn = async () => {
  await userEvent.type(screen.getByLabelText(/Username or Email/), "ann");
  await userEvent.type(screen.getByLabelText(/^Password/), "Passw0rd1");
  await userEvent.click(screen.getByRole("button", { name: "Login" }));
};

const refused = (status, message) =>
  Object.assign(new Error("refused"), {
    response: { status, data: { message } },
  });

beforeEach(() => vi.clearAllMocks());

test("a wait is passed on in the server's words", async () => {
  API.login.mockRejectedValue(
    refused(
      429,
      "Too many failed sign-ins for that account. Try again in 30 seconds, or reset your password."
    )
  );
  draw();

  await signIn();

  expect(
    await screen.findByText(/Try again in 30 seconds/)
  ).toBeInTheDocument();
});

test("a wrong password still says so", async () => {
  API.login.mockRejectedValue(
    refused(401, "Incorrect username, email or password")
  );
  draw();

  await signIn();

  expect(
    await screen.findByText("Incorrect username or password.")
  ).toBeInTheDocument();
});

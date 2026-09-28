// Changing your email from the Profile page (UX audit finding #23).
//
// You could change your username, team and password, but not your email -
// which is where password reset goes. The change asks for the current password
// and waits for a link sent to the new address.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import API from "../../utils/TipsAPI";
import AuthAPI from "../../utils/AuthAPI";
import SettingsPage from "./index";

vi.mock("../../utils/TipsAPI", () => ({
  default: {
    getTeams: vi.fn(),
    getUserDetails: vi.fn(),
    updateFavouriteTeam: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock("../../utils/AuthAPI", () => ({
  default: {
    changeUsername: vi.fn(),
    changePassword: vi.fn(),
    changeEmail: vi.fn(),
  },
}));

const DETAILS = {
  username: "Pete_331",
  firstName: "Pete",
  lastName: "B",
  email: "pete@old.test",
  favTeam: 1,
  teamDetail: [{ name: "Adelaide" }],
};

const draw = () =>
  render(
    withTheme(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: { id: "u1", name: "Pete_331", isAuthenticated: true },
            setUser: vi.fn(),
            checked: true,
          }}
        >
          <SettingsPage />
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

const card = async () => {
  const title = await screen.findByRole("heading", { name: "Change email" });
  return within(title.closest("div"));
};

beforeEach(() => {
  vi.clearAllMocks();
  API.getTeams.mockResolvedValue({ data: [] });
  API.getUserDetails.mockResolvedValue({ data: DETAILS });
});

describe("changing your email", () => {
  test("asks for the new address and your current password", async () => {
    AuthAPI.changeEmail.mockResolvedValue({
      data: { message: "Check pete@new.test for a link to confirm it." },
    });
    draw();
    const c = await card();

    await userEvent.type(c.getByLabelText("New email"), "pete@new.test");
    await userEvent.type(
      c.getByLabelText("Current password", { selector: "input" }),
      "Passw0rd1"
    );
    await userEvent.click(
      c.getByRole("button", { name: "Send confirmation link" })
    );

    await waitFor(() =>
      expect(AuthAPI.changeEmail).toHaveBeenCalledWith({
        email: "pete@new.test",
        password: "Passw0rd1",
      })
    );
    expect(
      await screen.findByText(/Check pete@new.test for a link/)
    ).toBeInTheDocument();
  });

  test("won't send without both", async () => {
    draw();
    const c = await card();

    const send = c.getByRole("button", { name: "Send confirmation link" });
    expect(send).toBeDisabled();

    await userEvent.type(c.getByLabelText("New email"), "pete@new.test");
    expect(send).toBeDisabled();
  });

  test("an address that isn't one is caught before it is sent", async () => {
    draw();
    const c = await card();

    await userEvent.type(c.getByLabelText("New email"), "not an address");
    await userEvent.type(
      c.getByLabelText("Current password", { selector: "input" }),
      "Passw0rd1"
    );
    await userEvent.click(
      c.getByRole("button", { name: "Send confirmation link" })
    );

    expect(
      await c.findByText("Please enter a valid email address.")
    ).toBeInTheDocument();
    expect(AuthAPI.changeEmail).not.toHaveBeenCalled();
  });

  test("what the server says is wrong is said under the field", async () => {
    AuthAPI.changeEmail.mockRejectedValue({
      response: { data: { message: "Your current password is incorrect." } },
    });
    draw();
    const c = await card();

    await userEvent.type(c.getByLabelText("New email"), "pete@new.test");
    await userEvent.type(
      c.getByLabelText("Current password", { selector: "input" }),
      "nope"
    );
    await userEvent.click(
      c.getByRole("button", { name: "Send confirmation link" })
    );

    expect(
      await c.findByText("Your current password is incorrect.")
    ).toBeInTheDocument();
  });

  test("a change waiting to be confirmed is said", async () => {
    API.getUserDetails.mockResolvedValue({
      data: {
        ...DETAILS,
        pendingEmail: "pete@new.test",
        emailChangeExpires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    });
    draw();
    const c = await card();

    expect(
      c.getByText(/Waiting for you to confirm pete@new.test/)
    ).toBeInTheDocument();
  });

  test("but not once its link has expired", async () => {
    API.getUserDetails.mockResolvedValue({
      data: {
        ...DETAILS,
        pendingEmail: "pete@new.test",
        emailChangeExpires: new Date(Date.now() - 1000).toISOString(),
      },
    });
    draw();
    const c = await card();

    expect(c.queryByText(/Waiting for you to confirm/)).not.toBeInTheDocument();
  });
});

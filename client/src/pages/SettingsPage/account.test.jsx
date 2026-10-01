// Changing your password and deleting your account, as the profile page does
// them.
//
// Found untested by measuring the client's coverage: the page's username,
// email and loading paths had tests, these two did not. The server's side of
// each is in routes/account.route.test.js and routes/deleteAccount.route.test.js.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import API from "../../utils/TipsAPI";
import AuthAPI from "../../utils/AuthAPI";
import SettingsPage from "./index";

vi.setConfig({ testTimeout: 15000 });

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
  email: "pete@home.test",
  favTeam: 1,
  teamDetail: [{ name: "Adelaide" }],
};

let setUser;

const draw = () =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/settings"]}>
        <AuthContext.Provider
          value={{
            user: { id: "u1", name: "Pete_331", isAuthenticated: true },
            setUser,
            checked: true,
          }}
        >
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/login" element={<p>the sign-in page</p>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

// What axios rejects with when the server answers with a status.
const answered = (status, message) =>
  Object.assign(new Error(`Request failed with status ${status}`), {
    response: { status, data: { message } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  setUser = vi.fn();
  API.getTeams.mockResolvedValue({ data: [] });
  API.getUserDetails.mockResolvedValue({ data: DETAILS });
});

describe("changing your password", () => {
  const card = async () => {
    const title = await screen.findByRole("heading", {
      name: "Change password",
    });
    return within(title.closest("div"));
  };

  const field = (inCard, label) =>
    inCard.getByLabelText(new RegExp(`^${label}`));

  const fill = async (inCard, current, next, confirm = next) => {
    await userEvent.type(field(inCard, "Current password"), current);
    await userEvent.type(field(inCard, "New password"), next);
    await userEvent.type(field(inCard, "Confirm new password"), confirm);
  };

  const button = (inCard) =>
    inCard.getByRole("button", { name: "Change password" });

  test("can't be asked until all three are filled in", async () => {
    draw();
    const inCard = await card();

    expect(button(inCard)).toBeDisabled();
    await userEvent.type(field(inCard, "Current password"), "Passw0rd1");
    await userEvent.type(field(inCard, "New password"), "N3wpassword");
    expect(button(inCard)).toBeDisabled();
    await userEvent.type(field(inCard, "Confirm new password"), "N3wpassword");
    expect(button(inCard)).toBeEnabled();
  });

  test("the new one typed the same twice", async () => {
    draw();
    const inCard = await card();
    await fill(inCard, "Passw0rd1", "N3wpassword", "N3wpasswrod");
    await userEvent.click(button(inCard));

    expect(
      inCard.getByText("The new passwords do not match.")
    ).toBeInTheDocument();
    expect(AuthAPI.changePassword).not.toHaveBeenCalled();
  });

  test("and the complaint goes when you fix it", async () => {
    draw();
    const inCard = await card();
    await fill(inCard, "Passw0rd1", "N3wpassword", "N3wpasswrod");
    await userEvent.click(button(inCard));
    await userEvent.type(field(inCard, "Confirm new password"), "x");

    expect(
      inCard.queryByText("The new passwords do not match.")
    ).not.toBeInTheDocument();
  });

  test("sends the current and the new, and clears the form", async () => {
    AuthAPI.changePassword.mockResolvedValue({
      data: {
        message: "Password changed. You have been signed out everywhere else.",
      },
    });
    draw();
    const inCard = await card();
    await fill(inCard, "Passw0rd1", "N3wpassword");
    await userEvent.click(button(inCard));

    expect(AuthAPI.changePassword).toHaveBeenCalledWith({
      currentPassword: "Passw0rd1",
      newPassword: "N3wpassword",
    });
    expect(
      await screen.findByText(
        "Password changed. You have been signed out everywhere else."
      )
    ).toBeInTheDocument();
    expect(field(inCard, "Current password")).toHaveValue("");
    expect(field(inCard, "New password")).toHaveValue("");
    expect(field(inCard, "Confirm new password")).toHaveValue("");
  });

  // Said under the fields, and what was typed is kept to correct.
  test("a refusal says why and keeps what you typed", async () => {
    AuthAPI.changePassword.mockRejectedValue(
      answered(403, "Your current password is incorrect.")
    );
    draw();
    const inCard = await card();
    await fill(inCard, "Wr0ngpassword", "N3wpassword");
    await userEvent.click(button(inCard));

    expect(
      await inCard.findByText("Your current password is incorrect.")
    ).toBeInTheDocument();
    expect(field(inCard, "New password")).toHaveValue("N3wpassword");
  });

  test("no answer at all is still answered", async () => {
    AuthAPI.changePassword.mockRejectedValue(new Error("Network Error"));
    draw();
    const inCard = await card();
    await fill(inCard, "Passw0rd1", "N3wpassword");
    await userEvent.click(button(inCard));

    expect(
      await inCard.findByText("Unable to change your password.")
    ).toBeInTheDocument();
  });
});

describe("deleting your account", () => {
  const ask = async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete account" })
    );
    return within(await screen.findByRole("dialog"));
  };

  // It cannot be undone, so it is asked twice - and the question names whose
  // account it is.
  test("asks first, naming the account", async () => {
    draw();
    const dialog = await ask();

    expect(dialog.getByText("Delete your account?")).toBeInTheDocument();
    expect(dialog.getByText(/Pete_331's account/)).toBeInTheDocument();
    expect(API.deleteUser).not.toHaveBeenCalled();
  });

  test("and cancelling changes nothing", async () => {
    draw();
    const dialog = await ask();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(API.deleteUser).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
  });

  test("confirming signs you out and goes to sign in", async () => {
    API.deleteUser.mockResolvedValue({
      data: { success: true, message: "Account successfully deleted." },
    });
    draw();
    const dialog = await ask();
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" })
    );

    expect(await screen.findByText("the sign-in page")).toBeInTheDocument();
    expect(API.deleteUser).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith({
      isAuthenticated: false,
      name: null,
      id: null,
      admin: false,
    });
  });

  test("while it goes, the button says so and can't be pressed", async () => {
    API.deleteUser.mockReturnValue(new Promise(() => {}));
    draw();
    const dialog = await ask();
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" })
    );

    expect(
      await screen.findByRole("button", { name: "Deleting..." })
    ).toBeDisabled();
  });

  // A 200 that says it did not work is not a deletion: nobody is signed out
  // of an account that still exists.
  test("an answer that it failed leaves you signed in, and says so", async () => {
    API.deleteUser.mockResolvedValue({
      data: { success: false, message: "That account is not yours." },
    });
    draw();
    const dialog = await ask();
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" })
    );

    expect(
      await screen.findByText("That account is not yours.")
    ).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "Delete account" })
    ).toBeEnabled();
  });

  test("and so does a refusal", async () => {
    API.deleteUser.mockRejectedValue(
      answered(500, "Unable to delete account.")
    );
    draw();
    const dialog = await ask();
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" })
    );

    expect(
      await screen.findByText("Unable to delete account.")
    ).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
  });
});

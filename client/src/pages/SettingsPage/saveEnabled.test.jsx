// When Save is live on the two cards that change one thing each.
//
// They sat side by side doing the same job and disagreed about it. Change
// username put Save below the field and kept it disabled until something was
// typed. Change favourite team put Save beside the select and had it live
// before anything had been touched - because the check was "is a team chosen",
// and a team is always chosen: whichever one you already support.
//
// So the button offered to save a change that had not been made, on a page
// whose other card would not.
//
// Only that is tested here. Everything else on this page is unchanged.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import API from "../../utils/TipsAPI";
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
  default: { changeUsername: vi.fn(), changePassword: vi.fn() },
}));

const TEAMS = [
  { id: 1, name: "Adelaide" },
  { id: 18, name: "West Coast" },
];

const user = { id: "u1", name: "Pete_331", isAuthenticated: true, admin: false };

const draw = () =>
  render(
    withTheme(
      <MemoryRouter>
        <AuthContext.Provider value={{ user, setUser: vi.fn(), checked: true }}>
          <SettingsPage />
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

// The card is found by its own heading, so "Save" means the right Save - there
// are several on this page and they are all called that.
const cardFor = async (heading) => {
  const title = await screen.findByRole("heading", { name: heading });
  return within(title.closest("div"));
};

beforeEach(() => {
  vi.clearAllMocks();
  API.getTeams.mockResolvedValue({ data: TEAMS });
  API.getUserDetails.mockResolvedValue({
    data: {
      username: "Pete_331",
      firstName: "Peter",
      lastName: "Brennan",
      email: "pete@example.test",
      favTeam: 18,
    },
  });
  API.updateFavouriteTeam.mockResolvedValue({ data: { message: "Saved." } });
});

describe("change favourite team", () => {
  test("Save is dead until the team actually changes", async () => {
    draw();
    const card = await cardFor("Change favourite team");

    await waitFor(() => expect(card.getByRole("button", { name: "Save" })).toBeDisabled());
  });

  test("and live once it does", async () => {
    draw();
    const card = await cardFor("Change favourite team");
    await waitFor(() => expect(card.getByRole("button", { name: "Save" })).toBeDisabled());

    // Opened and picked, not a change event on the hidden input - MUI's
    // Select is a listbox behind a button and does not listen to that one.
    const user = userEvent.setup({ delay: null });
    await user.click(card.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Adelaide" }));

    await waitFor(() =>
      expect(card.getByRole("button", { name: "Save" })).not.toBeDisabled()
    );
  });
});

describe("change username", () => {
  // The card that was already right. Held so the two stay in step.
  test("Save is dead until something is typed", async () => {
    draw();
    const card = await cardFor("Change username");

    expect(card.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/New username/), {
      target: { value: "petey" },
    });

    await waitFor(() =>
      expect(card.getByRole("button", { name: "Save" })).not.toBeDisabled()
    );
  });
});

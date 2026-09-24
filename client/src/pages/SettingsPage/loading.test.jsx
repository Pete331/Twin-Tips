// What the settings page asks for when it opens.
//
// Once each, and the account request carries nothing. The server answers for
// whoever is signed in and ignores the body - the account's id used to come
// from there, which let anyone read any account - so the page was sending the
// signed-in user's details up with every visit for no reason. Dropping them
// also left the loader reading nothing that changes between renders, which is
// what lets the effect run it once without listing it.

import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import API from "../../utils/TipsAPI";
import SettingsPage from "./index";

vi.mock("../../utils/TipsAPI", () => ({
  default: { getTeams: vi.fn(), getUserDetails: vi.fn() },
}));

vi.mock("../../utils/AuthAPI", () => ({ default: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  API.getTeams.mockResolvedValue({ data: [{ id: 18, name: "West Coast" }] });
  API.getUserDetails.mockResolvedValue({
    data: {
      username: "Pete_331",
      firstName: "Peter",
      lastName: "Brennan",
      email: "pete@example.test",
      favTeam: 18,
    },
  });
});

test("opening the page asks for the account once, and sends nothing with it", async () => {
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
  await screen.findByRole("heading", { name: "Change favourite team" });

  expect(API.getUserDetails).toHaveBeenCalledTimes(1);
  expect(API.getUserDetails).toHaveBeenCalledWith();
  expect(API.getTeams).toHaveBeenCalledTimes(1);
});

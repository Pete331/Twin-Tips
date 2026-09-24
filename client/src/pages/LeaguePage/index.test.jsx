// The league page's one fetch.
//
// It loads the league for the slug in the address, and has to load it again
// when the slug changes - following a link from one league to another reuses
// the page rather than mounting a new one. And only then: the loader is also
// what every action on the page calls to refresh, so an effect that depended
// on a loader rebuilt each render would refetch on every render.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";

import { withTheme } from "../../testTheme";
import LeagueAPI from "../../utils/LeagueAPI";
import LeaguePage from "./index";

vi.mock("../../utils/LeagueAPI", () => ({
  default: {
    detail: vi.fn(),
    update: vi.fn(),
    close: vi.fn(),
    removeMember: vi.fn(),
  },
}));

const league = (slug, name) => ({
  slug,
  name,
  type: "season",
  createdSeason: 2026,
  startRound: 1,
  isAdmin: false,
  memberCount: 1,
  members: [{ id: "u1", username: "you", isAdmin: false }],
  invite: null,
});

const draw = () =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/leagues/pool"]}>
        <Link to="/leagues/other">to the other league</Link>
        <Routes>
          <Route path="/leagues/:slug" element={<LeaguePage />} />
        </Routes>
      </MemoryRouter>
    )
  );

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.detail.mockImplementation((slug) =>
    Promise.resolve({
      data:
        slug === "pool"
          ? league("pool", "The Pool")
          : league("other", "The Other One"),
    })
  );
});

describe("loading a league", () => {
  test("opening the page loads the league once", async () => {
    draw();

    expect(
      await screen.findByRole("heading", { name: "The Pool" })
    ).toBeInTheDocument();
    expect(LeagueAPI.detail).toHaveBeenCalledTimes(1);
    expect(LeagueAPI.detail).toHaveBeenCalledWith("pool");
  });

  test("following a link to another league loads that one", async () => {
    draw();
    await screen.findByRole("heading", { name: "The Pool" });

    await userEvent.click(screen.getByText("to the other league"));

    expect(
      await screen.findByRole("heading", { name: "The Other One" })
    ).toBeInTheDocument();
    await waitFor(() => expect(LeagueAPI.detail).toHaveBeenCalledWith("other"));
    expect(LeagueAPI.detail).toHaveBeenCalledTimes(2);
  });
});

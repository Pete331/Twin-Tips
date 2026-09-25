// Where an invite link lands.
//
// It joined on arrival: one tap in a group chat and you were in the league,
// a $5-a-round pool included, without seeing the buy-in (UX audit finding
// #4). Now it shows the league and joins only when asked.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import { withTheme } from "../../testTheme";
import LeagueAPI from "../../utils/LeagueAPI";
import JoinLeague from "./index";

vi.mock("../../utils/LeagueAPI", () => ({
  default: { preview: vi.fn(), join: vi.fn() },
}));

const Ladder = () => {
  const location = useLocation();
  return <p>the ladder {location.search}</p>;
};

const draw = () =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/join/tok123"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinLeague />} />
          <Route path="/leaderboard" element={<Ladder />} />
          <Route path="/home" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    )
  );

const WORK_MATES = {
  name: "Work Mates",
  type: "weekly",
  buyIn: 5,
  admin: "priya",
  members: 6,
  alreadyMember: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.preview.mockResolvedValue({ data: WORK_MATES });
  LeagueAPI.join.mockResolvedValue({
    data: { name: "Work Mates", slug: "work-mates", alreadyMember: false },
  });
});

describe("an invite link", () => {
  test("shows the league, buy-in included, and joins nothing yet", async () => {
    draw();

    expect(
      await screen.findByRole("heading", { name: "Work Mates" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "$5 from each entrant per round. Winner takes all for the round."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Run by priya · 6 members")).toBeInTheDocument();
    expect(LeagueAPI.preview).toHaveBeenCalledWith({ token: "tok123" });
    expect(LeagueAPI.join).not.toHaveBeenCalled();
  });

  test("joining is the button, and lands on that league's ladder", async () => {
    draw();

    await userEvent.click(
      await screen.findByRole("button", { name: "Join Work Mates" })
    );

    expect(LeagueAPI.join).toHaveBeenCalledWith({ token: "tok123" });
    expect(
      await screen.findByText("the ladder ?league=work-mates")
    ).toBeInTheDocument();
  });

  test("not now goes home, still not joined", async () => {
    draw();

    await userEvent.click(await screen.findByRole("link", { name: "Not now" }));

    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(LeagueAPI.join).not.toHaveBeenCalled();
  });

  test("someone already in it is shown the way to it", async () => {
    LeagueAPI.preview.mockResolvedValue({
      data: { ...WORK_MATES, alreadyMember: true, slug: "work-mates" },
    });
    draw();

    expect(
      await screen.findByText("You are already in this league.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Join/ })
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "See the ladder" })
    );
    expect(
      await screen.findByText("the ladder ?league=work-mates")
    ).toBeInTheDocument();
    expect(LeagueAPI.join).not.toHaveBeenCalled();
  });

  test("a dead link says so", async () => {
    LeagueAPI.preview.mockRejectedValue({
      response: {
        data: { message: "That invite is not valid. Ask for a new link." },
      },
    });
    draw();

    expect(
      await screen.findByText("That invite did not work")
    ).toBeInTheDocument();
    expect(
      screen.getByText("That invite is not valid. Ask for a new link.")
    ).toBeInTheDocument();
  });
});

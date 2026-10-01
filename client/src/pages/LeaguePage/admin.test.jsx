// What a league's admin can do from its page - rename it, hand it on, remove
// someone, close it - and what a member can: leave.
//
// Found untested by measuring the client's coverage. Replacing the invite and
// who can see it are tested in index.test.jsx; the server's side of all of it
// is in routes/leagues.route.test.js.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import { withTheme } from "../../testTheme";
import LeagueAPI from "../../utils/LeagueAPI";
import LeaguePage from "./index";

vi.setConfig({ testTimeout: 15000 });

vi.mock("../../utils/LeagueAPI", () => ({
  default: {
    detail: vi.fn(),
    update: vi.fn(),
    close: vi.fn(),
    removeMember: vi.fn(),
  },
}));

// A pool run by you, with bob in it.
const run = (over = {}) => ({
  slug: "pool",
  name: "The Pool",
  type: "weekly",
  buyIn: 10,
  createdSeason: 2026,
  startRound: 1,
  isAdmin: true,
  memberCount: 2,
  members: [
    { id: "u1", username: "you", isAdmin: true, isYou: true },
    { id: "u2", username: "bob", isAdmin: false, isYou: false },
  ],
  invite: { token: "abc123", code: "TWIN-7FGG" },
  ...over,
});

// The same pool as bob sees it.
const membersView = () =>
  run({
    isAdmin: false,
    members: [
      { id: "u1", username: "zoe", isAdmin: true, isYou: false },
      { id: "u2", username: "you", isAdmin: false, isYou: true },
    ],
  });

// Where the page sends you after closing or leaving: the leaderboard, saying
// what it was handed.
const Leaderboard = () => {
  const { state } = useLocation();
  return <p>leaderboard: {state && state.alert && state.alert.message}</p>;
};

const draw = () =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/leagues/pool"]}>
        <Routes>
          <Route path="/leagues/:slug" element={<LeaguePage />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </MemoryRouter>
    )
  );

// The Save in the Rename panel - the payment note has a Save of its own.
const renameSave = () =>
  within(
    screen.getByRole("heading", { name: "Rename" }).closest("div")
  ).getByRole("button", { name: "Save" });

const loaded = () => screen.findByRole("heading", { name: "The Pool" });

const dialog = async () => within(await screen.findByRole("dialog"));
const closed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

// What axios rejects with when the server answers with a status.
const answered = (status, message) =>
  Object.assign(new Error(`Request failed with status ${status}`), {
    response: { status, data: { message } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.detail.mockResolvedValue({ data: run() });
  LeagueAPI.update.mockResolvedValue({ data: {} });
  LeagueAPI.close.mockResolvedValue({ data: { success: true } });
  LeagueAPI.removeMember.mockResolvedValue({ data: { success: true } });
});

describe("renaming", () => {
  const save = renameSave;
  const field = () => screen.getByLabelText("League name");

  test("waits for a name that is new", async () => {
    draw();
    await loaded();

    expect(save()).toBeDisabled();
    await userEvent.clear(field());
    expect(save()).toBeDisabled();
    await userEvent.type(field(), "Thursday Tips");
    expect(save()).toBeEnabled();
  });

  test("saves it, says so, and reloads the league", async () => {
    draw();
    await loaded();
    await userEvent.clear(field());
    await userEvent.type(field(), "Thursday Tips");
    await userEvent.click(save());

    expect(LeagueAPI.update).toHaveBeenCalledWith("pool", {
      name: "Thursday Tips",
    });
    expect(await screen.findByText("Renamed.")).toBeInTheDocument();
    await waitFor(() => expect(LeagueAPI.detail).toHaveBeenCalledTimes(2));
  });

  test("not offered to a member", async () => {
    LeagueAPI.detail.mockResolvedValue({ data: membersView() });
    draw();
    await loaded();

    expect(screen.queryByLabelText("League name")).toBeNull();
  });
});

describe("handing the league on", () => {
  const handOver = () => screen.getByRole("button", { name: "Hand over" });

  test("to a member you choose", async () => {
    draw();
    await loaded();
    expect(handOver()).toBeDisabled();

    await userEvent.click(screen.getByRole("combobox", { name: "New admin" }));
    await userEvent.click(await screen.findByRole("option", { name: "bob" }));
    await userEvent.click(handOver());

    expect(LeagueAPI.update).toHaveBeenCalledWith("pool", { admin: "u2" });
    expect(
      await screen.findByText("The league has a new admin.")
    ).toBeInTheDocument();
  });

  // You are the only one there, so there is nobody to give it to.
  test("not offered with nobody to hand it to", async () => {
    LeagueAPI.detail.mockResolvedValue({
      data: run({ memberCount: 1, members: [run().members[0]] }),
    });
    draw();
    await loaded();

    expect(screen.queryByRole("button", { name: "Hand over" })).toBeNull();
  });
});

describe("removing someone", () => {
  const ask = async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    return dialog();
  };

  // Says what follows rather than "are you sure?" - and that the invite they
  // were given still lets them back in.
  test("asks first, naming them and what it means", async () => {
    draw();
    const asking = await ask();

    expect(asking.getByText("Remove bob?")).toBeInTheDocument();
    expect(
      asking.getByText(/They can rejoin with the current invite link/)
    ).toBeInTheDocument();
  });

  test("keeping them changes nothing", async () => {
    draw();
    const asking = await ask();
    await userEvent.click(asking.getByRole("button", { name: "Keep them" }));

    await closed();
    expect(LeagueAPI.removeMember).not.toHaveBeenCalled();
  });

  test("removing them says so and reloads", async () => {
    draw();
    const asking = await ask();
    await userEvent.click(asking.getByRole("button", { name: "Remove" }));

    expect(LeagueAPI.removeMember).toHaveBeenCalledWith("pool", "u2");
    expect(await screen.findByText("bob removed.")).toBeInTheDocument();
    await waitFor(() => expect(LeagueAPI.detail).toHaveBeenCalledTimes(2));
  });

  test("only the admin sees the button", async () => {
    LeagueAPI.detail.mockResolvedValue({ data: membersView() });
    draw();
    await loaded();

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});

describe("closing it", () => {
  const ask = async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Close league" }));
    return dialog();
  };

  test("asks first, saying who it disappears for", async () => {
    draw();
    const asking = await ask();

    expect(asking.getByText("Close The Pool?")).toBeInTheDocument();
    expect(
      asking.getByText(/It disappears for all 2 members/)
    ).toBeInTheDocument();
  });

  test("keeping it changes nothing", async () => {
    draw();
    const asking = await ask();
    await userEvent.click(asking.getByRole("button", { name: "Keep it" }));

    await closed();
    expect(LeagueAPI.close).not.toHaveBeenCalled();
  });

  // Straight to the leaderboard. It went by /leagues, which only redirects
  // there - and a redirect does not carry the message, so a closed league
  // vanished without a word.
  test("closing it lands on the leaderboard, saying so", async () => {
    draw();
    const asking = await ask();
    await userEvent.click(asking.getByRole("button", { name: "Close it" }));

    expect(LeagueAPI.close).toHaveBeenCalledWith("pool");
    expect(
      await screen.findByText("leaderboard: The Pool has been closed.")
    ).toBeInTheDocument();
  });

  test("a refusal says why and stays put", async () => {
    LeagueAPI.close.mockRejectedValue(
      answered(403, "Only the league admin can do that.")
    );
    draw();
    const asking = await ask();
    await userEvent.click(asking.getByRole("button", { name: "Close it" }));

    expect(
      await screen.findByText("Only the league admin can do that.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/^leaderboard:/)).toBeNull();
  });
});

describe("leaving it", () => {
  const ask = async () => {
    LeagueAPI.detail.mockResolvedValue({ data: membersView() });
    draw();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Leave" }));
    return dialog();
  };

  test("a member is offered leaving, not closing", async () => {
    LeagueAPI.detail.mockResolvedValue({ data: membersView() });
    draw();
    await loaded();

    expect(
      screen.getByRole("heading", { name: "Leave this league" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close league" })).toBeNull();
  });

  test("staying changes nothing", async () => {
    const asking = await ask();
    await userEvent.click(asking.getByRole("button", { name: "Stay" }));

    await closed();
    expect(LeagueAPI.removeMember).not.toHaveBeenCalled();
  });

  test("leaving takes you out, to the leaderboard, saying so", async () => {
    const asking = await ask();
    await userEvent.click(asking.getByRole("button", { name: "Leave" }));

    expect(LeagueAPI.removeMember).toHaveBeenCalledWith("pool", "u2");
    expect(
      await screen.findByText("leaderboard: You have left The Pool.")
    ).toBeInTheDocument();
  });
});

// One change at a time: while one is on its way, the rest wait.
test("nothing else can be pressed while a change is going", async () => {
  LeagueAPI.update.mockReturnValue(new Promise(() => {}));
  draw();
  await loaded();
  await userEvent.clear(screen.getByLabelText("League name"));
  await userEvent.type(screen.getByLabelText("League name"), "Thursday Tips");
  await userEvent.click(renameSave());

  expect(renameSave()).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close league" })).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Remove" })[0]).toBeDisabled();
});

// Closed, or never yours to read: the server answers both the same.
test("a league that can't be read says so, with a way back", async () => {
  LeagueAPI.detail.mockRejectedValue(answered(404, "No such league."));
  draw();

  expect(
    await screen.findByRole("heading", { name: "League not found" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to your leagues" })
  ).toHaveAttribute("href", "/leaderboard");
});

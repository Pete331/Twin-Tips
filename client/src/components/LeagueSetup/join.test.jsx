// Joining with a code, from the league picker.
//
// A code joined on the spot, so the first anyone saw of a pool's buy-in was
// after they were in it (UX audit finding #4). Now the code finds the league,
// the sheet shows it, and joining is a second, named button.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../../testTheme";
import LeagueAPI from "../../utils/LeagueAPI";
import LeagueSetup from "./index";

vi.mock("../../utils/LeagueAPI", () => ({
  default: { preview: vi.fn(), join: vi.fn(), create: vi.fn() },
}));

const WORK_MATES = {
  name: "Work Mates",
  type: "weekly",
  buyIn: 5,
  admin: "priya",
  members: 6,
  alreadyMember: false,
};

const draw = () => {
  const props = { say: vi.fn(), onClose: vi.fn(), onJoined: vi.fn() };
  render(
    withTheme(
      <MemoryRouter>
        <LeagueSetup mode="join" {...props} />
      </MemoryRouter>
    )
  );
  return props;
};

const findWith = async (code) => {
  await userEvent.type(screen.getByLabelText("Join code"), code);
  await userEvent.click(screen.getByRole("button", { name: "Find league" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  LeagueAPI.preview.mockResolvedValue({ data: WORK_MATES });
  LeagueAPI.join.mockResolvedValue({
    data: { name: "Work Mates", slug: "work-mates", alreadyMember: false },
  });
});

describe("joining with a code", () => {
  test("the code finds the league and shows it, joining nothing", async () => {
    draw();

    await findWith("TWIN-CUXD");

    expect(LeagueAPI.preview).toHaveBeenCalledWith({ code: "TWIN-CUXD" });
    expect(
      await screen.findByRole("heading", { name: "Work Mates" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\$5 from each entrant per round/)
    ).toBeInTheDocument();
    expect(LeagueAPI.join).not.toHaveBeenCalled();
  });

  test("joining is the named button", async () => {
    const { say, onJoined, onClose } = draw();
    await findWith("TWIN-CUXD");

    await userEvent.click(
      await screen.findByRole("button", { name: "Join Work Mates" })
    );

    expect(LeagueAPI.join).toHaveBeenCalledWith({ code: "TWIN-CUXD" });
    expect(say).toHaveBeenCalledWith("success", "Joined Work Mates.");
    expect(onJoined).toHaveBeenCalledWith("work-mates");
    expect(onClose).toHaveBeenCalled();
  });

  test("a different code goes back to the field", async () => {
    draw();
    await findWith("TWIN-CUXD");

    await userEvent.click(
      await screen.findByRole("button", { name: "Different code" })
    );

    expect(screen.getByLabelText("Join code")).toBeInTheDocument();
    expect(LeagueAPI.join).not.toHaveBeenCalled();
  });

  test("a league you are already in is shown to you, not joined again", async () => {
    LeagueAPI.preview.mockResolvedValue({
      data: { ...WORK_MATES, alreadyMember: true, slug: "work-mates" },
    });
    const { onJoined } = draw();
    await findWith("TWIN-CUXD");

    await userEvent.click(
      await screen.findByRole("button", { name: /already in it/ })
    );

    expect(onJoined).toHaveBeenCalledWith("work-mates");
    expect(LeagueAPI.join).not.toHaveBeenCalled();
  });

  test("a code that finds nothing says so", async () => {
    LeagueAPI.preview.mockRejectedValue({
      response: {
        status: 404,
        data: { message: "That invite is not valid. Ask for a new link." },
      },
    });
    const { say } = draw();

    await findWith("TWIN-NOPE");

    expect(say).toHaveBeenCalledWith(
      "error",
      "That invite is not valid. Ask for a new link."
    );
  });
});

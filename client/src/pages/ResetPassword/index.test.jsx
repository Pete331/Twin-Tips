// The password reset page, as a link opens it.
//
// UX audit finding #22: it showed the whole "Create New Password" form for any
// link, so somebody holding an expired or used one found out only after typing
// a new password twice. The page now asks whether the link works first.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { withTheme } from "../../testTheme";
import API from "../../utils/AuthAPI";
import ResetPassword from "./index";

vi.mock("../../utils/AuthAPI", () => ({
  default: { checkResetToken: vi.fn(), resetPassword: vi.fn() },
}));

const draw = () =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/reset/tok123"]}>
        <Routes>
          <Route path="/reset/:token" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>
    )
  );

// What axios rejects with when the server answers with a status.
const answered = (status) =>
  Object.assign(new Error(`Request failed with status ${status}`), {
    response: { status, data: {} },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("opening a reset link", () => {
  test("it asks whether the link works, with the link's token", async () => {
    API.checkResetToken.mockResolvedValue({ data: { valid: true } });
    draw();

    await screen.findByRole("heading", { name: "Create New Password" });
    expect(API.checkResetToken).toHaveBeenCalledWith({ token: "tok123" });
  });

  test("a working link shows the form", async () => {
    API.checkResetToken.mockResolvedValue({ data: { valid: true } });
    draw();

    expect(
      await screen.findByRole("heading", { name: "Create New Password" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/New Password/)).toBeInTheDocument();
  });

  // The finding: said before anything is typed, with the way forward.
  test("a dead link says so, and offers a new one", async () => {
    API.checkResetToken.mockRejectedValue(answered(422));
    draw();

    expect(
      await screen.findByRole("heading", { name: "This link has expired" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Send a new link" })
    ).toHaveAttribute("href", "/forgot");
    expect(screen.queryByLabelText(/New Password/)).not.toBeInTheDocument();
  });

  // A server that couldn't be reached is not a dead link. The reset itself
  // will say if it is.
  test("a check that fails for another reason still shows the form", async () => {
    API.checkResetToken.mockRejectedValue(new Error("Network Error"));
    draw();

    expect(
      await screen.findByRole("heading", { name: "Create New Password" })
    ).toBeInTheDocument();
  });

  test("so does one the server fumbled", async () => {
    API.checkResetToken.mockRejectedValue(answered(500));
    draw();

    expect(
      await screen.findByRole("heading", { name: "Create New Password" })
    ).toBeInTheDocument();
  });

  test("and while it asks, neither is shown yet", () => {
    API.checkResetToken.mockReturnValue(new Promise(() => {}));
    draw();

    expect(screen.getByText("Checking your link...")).toBeInTheDocument();
    expect(screen.queryByLabelText(/New Password/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Send a new link" })
    ).not.toBeInTheDocument();
  });
});

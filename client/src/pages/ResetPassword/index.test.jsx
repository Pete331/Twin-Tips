// The password reset page, as a link opens it.
//
// UX audit finding #22: it showed the whole "Create New Password" form for any
// link, so somebody holding an expired or used one found out only after typing
// a new password twice. The page now asks whether the link works first.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import userEvent from "@testing-library/user-event";

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

// Setting the new password, once the link has checked out. Found untested by
// measuring the client's coverage: only opening the link was tried.
describe("setting the new password", () => {
  // The reset page, and a sign-in page that says what it was handed.
  const Landed = () => {
    const { state } = useLocation();
    return <p>signed out: {state && state.alert && state.alert.message}</p>;
  };

  const open = async () => {
    API.checkResetToken.mockResolvedValue({ data: { valid: true } });
    render(
      withTheme(
        <MemoryRouter initialEntries={["/reset/tok123"]}>
          <Routes>
            <Route path="/reset/:token" element={<ResetPassword />} />
            <Route path="/login" element={<Landed />} />
          </Routes>
        </MemoryRouter>
      )
    );
    await screen.findByLabelText(/^New Password/);
  };

  const fill = async (password, confirm = password) => {
    if (password) {
      await userEvent.type(screen.getByLabelText(/^New Password/), password);
    }
    if (confirm) {
      await userEvent.type(screen.getByLabelText(/^Confirm Password/), confirm);
    }
  };

  const submit = () =>
    userEvent.click(screen.getByRole("button", { name: "Set new password" }));

  test("needs a password", async () => {
    await open();
    await submit();

    expect(screen.getByText("Password cannot be blank")).toBeInTheDocument();
    expect(API.resetPassword).not.toHaveBeenCalled();
  });

  test("typed the same twice", async () => {
    await open();
    await fill("Passw0rd1", "Passw0rd2");
    await submit();

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(API.resetPassword).not.toHaveBeenCalled();
  });

  test("and the complaint goes once you type again", async () => {
    await open();
    await submit();
    await fill("P");

    expect(
      screen.queryByText("Password cannot be blank")
    ).not.toBeInTheDocument();
  });

  test("sends the link's token with it, then goes to sign in", async () => {
    API.resetPassword.mockResolvedValue({ data: { success: true } });
    await open();
    await fill("Passw0rd1");
    await submit();

    expect(API.resetPassword).toHaveBeenCalledWith({
      token: "tok123",
      password: "Passw0rd1",
      confirmPassword: "Passw0rd1",
    });
    expect(
      await screen.findByText(
        "signed out: Password changed. Sign in with your new one."
      )
    ).toBeInTheDocument();
  });

  test("a refusal says why, and leaves you on the form", async () => {
    API.resetPassword.mockRejectedValue(
      Object.assign(new Error("Request failed with status 400"), {
        response: { status: 400, data: { message: "Password too weak." } },
      })
    );
    await open();
    await fill("Passw0rd1");
    await submit();

    expect(await screen.findByText("Password too weak.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^New Password/)).toBeInTheDocument();
  });

  // No answer at all - offline, say. The handler read err.response.data and
  // threw inside its own catch, so nothing was said and the button seemed to
  // do nothing.
  test("no answer at all still says something went wrong", async () => {
    API.resetPassword.mockRejectedValue(new Error("Network Error"));
    await open();
    await fill("Passw0rd1");
    await submit();

    expect(
      await screen.findByText("Oops, something went wrong!")
    ).toBeInTheDocument();
  });

  // A link works once. A second tap sent a second request, which met a used
  // link - and its refusal arrived after the first had moved the page on.
  test("one request at a time", async () => {
    let finish;
    API.resetPassword.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await open();
    await fill("Passw0rd1");
    await submit();

    const button = screen.getByRole("button", { name: "Setting..." });
    expect(button).toBeDisabled();
    // Enter in a field submits the form whatever the button says.
    fireEvent.submit(button.closest("form"));
    expect(API.resetPassword).toHaveBeenCalledTimes(1);

    finish({ data: { success: true } });
    expect(await screen.findByText(/^signed out:/)).toBeInTheDocument();
  });

  test("and the button is back after a refusal", async () => {
    API.resetPassword.mockRejectedValue(new Error("Network Error"));
    await open();
    await fill("Passw0rd1");
    await submit();
    await screen.findByText("Oops, something went wrong!");

    expect(
      screen.getByRole("button", { name: "Set new password" })
    ).toBeEnabled();
  });
});

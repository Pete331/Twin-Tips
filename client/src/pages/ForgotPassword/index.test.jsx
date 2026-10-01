// Asking for a password reset link - the way back in for somebody who cannot
// sign in, so the one page here that has to work when everything else has
// gone wrong.
//
// Found untested by measuring the client's coverage. The server's side is in
// controllers/forgotPassword.test.js; this is what the page does with it.

import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import { withTheme } from "../../testTheme";
import API from "../../utils/AuthAPI";
import ForgotPassword from "./index";

vi.mock("../../utils/AuthAPI", () => ({
  default: { forgotPassword: vi.fn() },
}));

// The sign-in page, saying what it was handed on arrival.
const Landed = () => {
  const { state } = useLocation();
  return <p>sign in: {state && state.alert && state.alert.message}</p>;
};

const draw = () =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/forgot"]}>
        <Routes>
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/login" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    )
  );

const email = () => screen.getByLabelText(/^Email Address/);
const send = () =>
  userEvent.click(screen.getByRole("button", { name: "Send email" }));

// What axios rejects with when the server answers with a status.
const answered = (status, message) =>
  Object.assign(new Error(`Request failed with status ${status}`), {
    response: { status, data: { message } },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

test("needs an address", async () => {
  draw();
  await send();

  expect(screen.getByText("Email cannot be blank")).toBeInTheDocument();
  expect(API.forgotPassword).not.toHaveBeenCalled();
});

test("that looks like one", async () => {
  draw();
  await userEvent.type(email(), "pat at home");
  await send();

  expect(
    screen.getByText("Please enter a valid email address")
  ).toBeInTheDocument();
  expect(API.forgotPassword).not.toHaveBeenCalled();
});

test("and the complaint goes once you type again", async () => {
  draw();
  await send();
  await userEvent.type(email(), "p");

  expect(screen.queryByText("Email cannot be blank")).not.toBeInTheDocument();
});

// The server's answer is the same whether or not the address has an account,
// so the page passes on what it says rather than writing its own.
test("sends it, then goes to sign in with the server's answer", async () => {
  API.forgotPassword.mockResolvedValue({
    data: { message: "If that address has an account, a link is on its way." },
  });
  draw();
  await userEvent.type(email(), "pat@home.test");
  await send();

  expect(API.forgotPassword).toHaveBeenCalledWith({ email: "pat@home.test" });
  expect(
    await screen.findByText(
      "sign in: If that address has an account, a link is on its way."
    )
  ).toBeInTheDocument();
});

// Five emails an hour, and impatient tapping used to spend them all on one
// request - locking somebody out of the only way back in.
test("one request at a time", async () => {
  let finish;
  API.forgotPassword.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  draw();
  await userEvent.type(email(), "pat@home.test");
  await send();

  const button = screen.getByRole("button", { name: "Sending..." });
  expect(button).toBeDisabled();
  // Enter in the field submits the form whatever the button says.
  fireEvent.submit(button.closest("form"));
  expect(API.forgotPassword).toHaveBeenCalledTimes(1);

  finish({ data: { message: "On its way." } });
  expect(await screen.findByText("sign in: On its way.")).toBeInTheDocument();
});

test("a refusal says why, and the button comes back", async () => {
  API.forgotPassword.mockRejectedValue(
    answered(429, "Too many reset requests. Try again in an hour.")
  );
  draw();
  await userEvent.type(email(), "pat@home.test");
  await send();

  expect(
    await screen.findByText("Too many reset requests. Try again in an hour.")
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send email" })).toBeEnabled();
});

test("no answer at all still says something went wrong", async () => {
  API.forgotPassword.mockRejectedValue(new Error("Network Error"));
  draw();
  await userEvent.type(email(), "pat@home.test");
  await send();

  expect(
    await screen.findByText("Oops, something went wrong!")
  ).toBeInTheDocument();
});

test("and remembering it is a way back to sign in", () => {
  draw();

  expect(
    screen.getByRole("link", { name: "Just remembered? Sign in" })
  ).toHaveAttribute("href", "/login");
});

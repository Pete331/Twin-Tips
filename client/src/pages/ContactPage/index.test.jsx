// The contact form, rendered.
//
// The page exists for people who cannot sign in, so the things worth holding
// are the ones that would silently strand them: a submission that never leaves,
// a second click spending the hour's allowance on one message, and a failure
// reported as a success.
//
// ContactAPI is stubbed. What the server does with the payload is held to
// account by routes/contact.route.test.js and utils/nodeMailer.contact.test.js.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../../testTheme";

import API from "../../utils/ContactAPI";
import ContactPage from "./index";

vi.mock("../../utils/ContactAPI", () => ({
  default: { send: vi.fn() },
}));

// Inside a Router because Alerts reads useLocation - it clears itself on a
// route change, which is why it needs one. The app always provides it.
const draw = () =>
  render(
    withTheme(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    )
  );

// Fields are set in one event rather than typed.
//
// userEvent types character by character, and every character re-renders a page
// holding four controlled MUI fields. Even with the inter-key delay off that
// ran at two seconds a test alone and timed out at five inside the full suite,
// where the run is competing for a core. Nothing here depends on per-character
// events - handleChange only stores the value - so a single change event is the
// same input to this component and a hundred times less work.
//
// Clicks stay real: they are cheap, and the button being disabled mid-flight is
// behaviour worth exercising the way a person meets it.
let user;

const fillIn = async (over = {}) => {
  const values = {
    "Your name": "Ann Tipper",
    "Your email": "ann@example.test",
    "How can we help?": "I cannot sign in.",
    ...over,
  };

  for (const [label, value] of Object.entries(values)) {
    if (!value) continue;
    fireEvent.change(screen.getByLabelText(new RegExp(label)), {
      target: { value },
    });
  }
};

const submit = () =>
  user.click(screen.getByRole("button", { name: /Send message/ }));

beforeEach(() => {
  vi.clearAllMocks();
  user = userEvent.setup({ delay: null });
  API.send.mockResolvedValue({ data: { success: true, message: "On its way." } });
});

describe("what it refuses to send", () => {
  test("a message with no name", async () => {
    draw();
    await fillIn({ "Your name": "" });
    await submit();

    expect(await screen.findByText("Please tell us your name")).toBeInTheDocument();
    expect(API.send).not.toHaveBeenCalled();
  });

  test("a message with no address to reply to", async () => {
    draw();
    await fillIn({ "Your email": "" });
    await submit();

    expect(
      await screen.findByText("Please give us an address to reply to")
    ).toBeInTheDocument();
    expect(API.send).not.toHaveBeenCalled();
  });

  test("an address that is not one", async () => {
    draw();
    await fillIn({ "Your email": "ann-at-example" });
    await submit();

    expect(
      await screen.findByText("Please enter a valid email address")
    ).toBeInTheDocument();
    expect(API.send).not.toHaveBeenCalled();
  });

  test("an empty message", async () => {
    draw();
    await fillIn({ "How can we help?": "" });
    await submit();

    expect(
      await screen.findByText("Please tell us what you need help with")
    ).toBeInTheDocument();
    expect(API.send).not.toHaveBeenCalled();
  });
});

describe("what it sends", () => {
  test("everything that was typed, subject included", async () => {
    draw();
    await fillIn();
    fireEvent.change(screen.getByLabelText(/Subject/), {
      target: { value: "Locked out" },
    });
    await submit();

    await waitFor(() =>
      expect(API.send).toHaveBeenCalledWith({
        name: "Ann Tipper",
        email: "ann@example.test",
        subject: "Locked out",
        message: "I cannot sign in.",
      })
    );
  });

  // The subject is optional here and on the server.
  test("and sends without a subject", async () => {
    draw();
    await fillIn();
    await submit();

    await waitFor(() => expect(API.send).toHaveBeenCalled());
    expect(API.send.mock.calls[0][0].subject).toBe("");
  });
});

describe("what happens after", () => {
  test("the server's own words are shown, not ours", async () => {
    draw();
    await fillIn();
    await submit();

    expect(await screen.findByText("On its way.")).toBeInTheDocument();
  });

  // So a second question starts from an empty form rather than the last one
  // still sitting in it.
  test("the form is cleared on success", async () => {
    draw();
    await fillIn();
    await submit();

    await waitFor(() => expect(API.send).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByLabelText(/Your name/)).toHaveValue("")
    );
    expect(screen.getByLabelText(/How can we help/)).toHaveValue("");
  });

  // Reported, and the message kept - somebody who has just typed four hundred
  // words should not lose them because the send failed.
  test("a failure says so and keeps what was typed", async () => {
    API.send.mockRejectedValue({
      response: { status: 502, data: { message: "Could not be sent." } },
    });

    draw();
    await fillIn();
    await submit();

    // The server's own words are withheld for a 5xx - see SPEAKS_TO_USERS in
    // utils/http. A provider failure names our sending address and our account
    // state, which is no help to whoever just wanted to ask a question.
    expect(
      await screen.findByText(/Something went wrong at our end/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/How can we help/)).toHaveValue(
      "I cannot sign in."
    );
  });

  // The route allows five an hour, so impatient clicking would spend the
  // allowance on one message. ForgotPassword fell into exactly this.
  test("a second click while the first is in the air sends nothing", async () => {
    let release;
    API.send.mockImplementation(
      () => new Promise((resolve) => (release = resolve))
    );

    draw();
    await fillIn();

    // The same element twice. Re-querying by name would not find it: the label
    // changes to "Sending..." on the first click, which is the behaviour under
    // test.
    const button = screen.getByRole("button");
    await user.click(button);

    // First layer: it cannot be clicked again. A disabled button takes
    // pointer-events: none, and user-event refuses to pretend otherwise.
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/Sending/);

    // Second layer: the handler refuses too.
    //
    // Reached by submitting the form rather than by clicking again, because a
    // disabled button does not dispatch a click at all - the guard is
    // unreachable that way, and a test that clicked it would be asserting the
    // disabled attribute a second time. A form can still be submitted without
    // its button, so the guard is not dead code.
    fireEvent.submit(button.closest("form"));

    expect(API.send).toHaveBeenCalledTimes(1);

    // Released inside act, so the state update it causes belongs to the test
    // rather than arriving after it and warning.
    await act(async () => release({ data: { message: "On its way." } }));
  });
});

// The likeliest failure on this form, and the one the app used to swallow.
//
// The route allows five an hour, and every limiter in middleware/rateLimit.js
// carries a sentence written for a person. Until 429 was added to
// SPEAKS_TO_USERS in utils/http, none of them reached one: they were replaced
// by "Something went wrong. Try again", which invites exactly the retry the
// limit exists to stop.
test("being rate limited says so, in the limiter's own words", async () => {
  API.send.mockRejectedValue({
    response: {
      status: 429,
      data: {
        success: false,
        message:
          "Too many messages sent. Please wait a while before sending another.",
      },
    },
  });

  draw();
  await fillIn();
  await submit();

  expect(await screen.findByText(/Too many messages sent/)).toBeInTheDocument();
});

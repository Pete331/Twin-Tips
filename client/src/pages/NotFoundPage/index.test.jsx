// An address the app has no page for.
//
// UX audit finding #22: it was "404 page not found!" with no way back to
// anything.

import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { withTheme } from "../../testTheme";
import { AuthContext } from "../../utils/AuthContext";
import NotFound from "./index";

const draw = (isAuthenticated) =>
  render(
    withTheme(
      <MemoryRouter initialEntries={["/no-such-page"]}>
        <AuthContext.Provider
          value={{
            user: { isAuthenticated },
            setUser: () => {},
            checked: true,
          }}
        >
          <NotFound />
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );

describe("a page that isn't there", () => {
  test("says so in words, as the tab does", () => {
    draw(true);

    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });

  test("somebody signed in is offered Home", () => {
    draw(true);

    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute(
      "href",
      "/home"
    );
  });

  test("somebody signed out is offered sign-in", () => {
    draw(false);

    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  // Nothing providing the context is still a page with a way out.
  test("and it renders with no one known at all", () => {
    render(
      withTheme(
        <MemoryRouter>
          <NotFound />
        </MemoryRouter>
      )
    );

    expect(screen.getByRole("link", { name: "Go to sign in" })).toBeTruthy();
  });
});

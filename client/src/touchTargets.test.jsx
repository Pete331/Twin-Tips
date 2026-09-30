// Room for a finger: 44px targets on a touch screen, and nothing changed for a
// mouse (UX audit finding #32).
//
// The sizes themselves were measured in a browser at 375px with a touch
// pointer - jsdom does no layout. What is checked here is that the CSS a touch
// screen applies is there on each kind of control, and only behind the touch
// query. See testTouch.js.

import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import MuiLink from "@mui/material/Link";

import { withTheme } from "./testTheme";
import { touchStyle, declaredValues } from "./testTouch";
import { touchLink } from "./theme";
import RoundPicker from "./components/RoundPicker";
import Footer from "./components/Footer";
import { AuthContext } from "./utils/AuthContext";

describe("the theme gives touch screens 44px controls", () => {
  test("buttons, of every size", () => {
    render(
      withTheme(
        <>
          <Button>Copy link</Button>
          <Button size="small">Create a league</Button>
        </>
      )
    );

    expect(touchStyle(screen.getByText("Copy link"))).toMatchObject({
      "min-height": "44px",
    });
    expect(touchStyle(screen.getByText("Create a league"))).toMatchObject({
      "min-height": "44px",
    });
  });

  // Square: the header's icons, the settings cog and the round arrows.
  test("icon buttons, both ways", () => {
    render(
      withTheme(
        <IconButton size="small" aria-label="Settings">
          x
        </IconButton>
      )
    );

    expect(
      touchStyle(screen.getByRole("button", { name: "Settings" }))
    ).toMatchObject({ "min-width": "44px", "min-height": "44px" });
  });

  test("toggle buttons", () => {
    render(
      withTheme(
        <ToggleButton value="round" size="small">
          Round
        </ToggleButton>
      )
    );

    expect(
      touchStyle(screen.getByRole("button", { name: "Round" }))
    ).toMatchObject({ "min-height": "44px" });
  });

  // A mouse keeps MUI's own sizes: none of this is outside the touch query.
  test("and nothing for a mouse", () => {
    render(withTheme(<Button>Copy link</Button>));

    expect(getComputedStyle(screen.getByText("Copy link")).minHeight).not.toBe(
      "44px"
    );
  });
});

describe("the controls that say it themselves", () => {
  // Its arrows are a fixed 44px, so the dropdown between them fills the same
  // height for everyone - it was 39.
  test("the round picker's dropdown is as tall as its arrows", () => {
    render(
      withTheme(
        <RoundPicker id="r" label="Round" value={2} options={[1, 2, 3]} />
      )
    );

    const select = screen.getByRole("combobox");
    expect(declaredValues(select, "padding-top")).toContain("10.5px");
    expect(declaredValues(select, "padding-bottom")).toContain("10.5px");
  });

  test("a link on its own line", () => {
    render(
      withTheme(
        <MemoryRouter>
          <MuiLink href="/leaderboard" sx={touchLink}>
            See the standings
          </MuiLink>
        </MemoryRouter>
      )
    );

    expect(touchStyle(screen.getByText("See the standings"))).toMatchObject({
      "min-height": "44px",
      display: "inline-flex",
    });
  });

  test("the footer's links", () => {
    render(
      withTheme(
        <MemoryRouter>
          <AuthContext.Provider value={{ user: { isAuthenticated: true } }}>
            <Footer />
          </AuthContext.Provider>
        </MemoryRouter>
      )
    );

    for (const name of ["Twin Tips", "Contact us"]) {
      expect(touchStyle(screen.getByRole("link", { name }))).toMatchObject({
        "min-height": "44px",
      });
    }
  });
});

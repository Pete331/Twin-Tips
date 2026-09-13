// What the browser tab says.
//
// Every page was titled "Twin Tips". Ten tabs were indistinguishable and
// history was a list of one word - but the part that is not cosmetic is that a
// screen reader announces the document title when it changes, so in a
// single-page app, where there is no page load, moving between pages was
// announced not at all.

import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import DocumentTitle, { titleFor } from "./index";

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DocumentTitle />
    </MemoryRouter>
  );

describe("the title for a route", () => {
  // Matching the heading on the page where there is one, so the tab and the
  // page agree about where you are.
  test.each([
    ["/home", "Home · Twin Tips"],
    ["/tipspage", "Tip now · Twin Tips"],
    ["/leaderboard", "Leaderboard · Twin Tips"],
    ["/settings", "Profile · Twin Tips"],
    ["/rulespage", "How to play · Twin Tips"],
    ["/contact", "Contact us · Twin Tips"],
    ["/login", "Sign in · Twin Tips"],
    ["/register", "Register · Twin Tips"],
    ["/forgot", "Forgot password · Twin Tips"],
    ["/", "Sign in · Twin Tips"],
  ])("%s is %s", (path, expected) => {
    expect(titleFor(path)).toBe(expected);
  });

  // Keyed on the first segment, so the rest of the path needs no matching.
  test("a league and a token keep their section's title", () => {
    expect(titleFor("/leagues/the-rivals")).toBe("League · Twin Tips");
    expect(titleFor("/reset/abc123def456")).toBe("Reset password · Twin Tips");
    expect(titleFor("/join/sometoken")).toBe("Join a league · Twin Tips");
  });

  // The navigation used to link to /Home and /TipsPage, so a bookmark or an
  // open tab from before still arrives in mixed case.
  test("an old mixed-case address still gets its title", () => {
    expect(titleFor("/Home")).toBe("Home · Twin Tips");
    expect(titleFor("/TipsPage")).toBe("Tip now · Twin Tips");
  });

  test("anything else is the page that is not there", () => {
    expect(titleFor("/nonsense")).toBe("Page not found · Twin Tips");
  });

  // A tab strip crops from the right, so what tells two tabs apart comes first.
  test("the page comes before the site name", () => {
    expect(titleFor("/home").indexOf("Home")).toBeLessThan(
      titleFor("/home").indexOf("Twin Tips")
    );
  });
});

describe("setting it", () => {
  test("the tab takes the route's title", () => {
    at("/leaderboard");
    expect(document.title).toBe("Leaderboard · Twin Tips");
  });

  test("and a different route a different one", () => {
    at("/settings");
    expect(document.title).toBe("Profile · Twin Tips");
  });

  // It renders nothing - it is an effect with a component around it.
  test("it draws nothing", () => {
    const { container } = at("/home");
    expect(container).toBeEmptyDOMElement();
  });
});

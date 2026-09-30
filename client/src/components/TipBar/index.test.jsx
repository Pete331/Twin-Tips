// The tip bar keeps what the browser scrolls into view clear of itself.
//
// It floats over the games, so a checkbox reached by Tab was brought to the
// bottom edge of the screen and left underneath it (UX audit finding #16). The
// fix is the page's scroll-padding-bottom, kept at the bar's height plus
// whatever sits below it. jsdom lays nothing out, so the heights here are
// stubbed: what is under test is that the bar measures itself, says so to the
// page, keeps saying so as it changes, and takes it back when it goes.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import TipBar from "./index";
import { TOP_EIGHT, BOTTOM_TEN } from "../../utils/ladderHalves";

// "#3b6fc0" as a computed style reports it.
const rgb = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

const padding = () => document.documentElement.style.scrollPaddingBottom;

let height;
let observed;

beforeEach(() => {
  height = 150;
  observed = null;

  // The bar's own height, as layout would report it.
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function offsetHeight() {
      return this.getAttribute("aria-label") === "Your tips" ? height : 0;
    }
  );

  // jsdom has no ResizeObserver. This one hands the test a way to fire it -
  // once something is being observed, and not before.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target) {
        observed = () => this.callback([{ target }]);
      }
      disconnect() {
        observed = null;
      }
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.scrollPaddingBottom = "";
});

const draw = () => render(withTheme(<TipBar onSubmit={() => {}} />));

describe("what the browser scrolls into view stays clear of the bar", () => {
  test("the page is padded by the bar's height, and a little more", () => {
    draw();

    expect(padding()).toBe("158px");
  });

  // On a phone the bar sits on the bottom navigation, which its own sticky
  // offset already says - so the padding covers both.
  test("and by whatever the bar is sitting on", () => {
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, ...rest) =>
      el.getAttribute && el.getAttribute("aria-label") === "Your tips"
        ? { ...real(el, ...rest), bottom: "56px" }
        : real(el, ...rest)
    );

    draw();

    expect(padding()).toBe("214px");
  });

  // The bar grows a row when a long name wraps.
  test("it follows the bar as it changes size", () => {
    draw();

    height = 190;
    observed();

    expect(padding()).toBe("198px");
  });

  test("and as the window does, with or without an observer", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("ResizeObserver", undefined);
    draw();

    height = 120;
    fireEvent(window, new Event("resize"));

    expect(padding()).toBe("128px");
  });

  // The rest of the site has no bar to clear.
  test("and takes it back when the bar goes", () => {
    const { unmount } = draw();

    unmount();

    expect(padding()).toBe("");
    expect(observed).toBeNull();
  });
});

// UX audit finding #27. The edges were green and red, which elsewhere mean a
// tip right or wrong; they take the colours of the cards each pick comes from.
describe("which pick is which", () => {
  const edgeOf = (label) =>
    getComputedStyle(screen.getByText(label).parentElement).borderLeftColor;

  test("the top 8 pick is edged in the top eight's blue", () => {
    draw();
    expect(edgeOf("Top 8")).toBe(rgb(TOP_EIGHT.accent));
  });

  test("and the bottom 10 pick in the bottom ten's amber", () => {
    draw();
    expect(edgeOf("Bottom 10")).toBe(rgb(BOTTOM_TEN.accent));
  });
});

// No interactive element wrapped in a link, anywhere.
//
// The navigation rendered <a href="/home"><button>Home</button></a>. An anchor
// may not contain interactive content, and a screen reader reads it out twice -
// "Home, link", then "Home, button" inside it. Every item, on every page. It
// was worth three or four duplicate accessible names per page on its own.
//
// MUI's answer is component={Link}, which renders one <a> styled as a button,
// and the same file already used it correctly for the help icon - so the fault
// was a disagreement inside one file rather than a missing idea.
//
// A source scan rather than a rendered assertion, for the same reason
// services/leagueRounds.readers.test.js is one: the thing worth preventing is
// the markup being written at all, in any of the twenty-odd files that could
// hold it, not just in the two where it happened to be.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..");

const sourceFiles = () => {
  const found = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next);
      } else if (entry.name.endsWith(".jsx") && !entry.name.includes(".test.")) {
        found.push(next);
      }
    }
  };

  walk(ROOT);
  return found;
};

// <Link ...> immediately wrapping a Button or IconButton. Deliberately narrow:
// a Link around a Box or a Typography is ordinary and fine.
const WRAPPED = /<Link\b[^>]*>\s*(?:\{[^}]*\}\s*)?<(Button|IconButton)\b/g;

describe("links do not wrap buttons", () => {
  test("nowhere in the client source", () => {
    const offenders = [];

    for (const file of sourceFiles()) {
      const source = fs.readFileSync(file, "utf8");
      const found = source.match(WRAPPED);
      if (found) {
        offenders.push(
          `${path.relative(ROOT, file).split(path.sep).join("/")} (${found.length})`
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  // A scan that reaches nothing passes everything.
  test("the scan reaches the source it claims to cover", () => {
    const files = sourceFiles();

    expect(files.length).toBeGreaterThan(20);
    expect(
      files.some((f) => f.endsWith(path.join("Navbar", "AppBarCollapse.jsx")))
    ).toBe(true);
    expect(files.some((f) => f.includes(".test."))).toBe(false);
  });

  // And that it recognises the shape it is looking for, so a regex that stopped
  // matching would not read as a clean result.
  test("and recognises the markup it is looking for", () => {
    const bad = '<Link to="/home">\n  <Button color="inherit">Home</Button>\n</Link>';
    const good = '<Button component={Link} to="/home" color="inherit">Home</Button>';

    expect(bad.match(WRAPPED)).not.toBeNull();
    expect(good.match(WRAPPED)).toBeNull();
  });
});

// Internal links are lowercase, matching the routes.
//
// The navigation pointed at /Home, /TipsPage, /Leaderboard and /Settings while
// every route in App is lowercase. React Router matches without regard to case,
// so it worked - and meant one page had two addresses: the logo went to /home
// and the nav to /Home, so history and bookmarks collected both.
//
// Scanned rather than asserted on a rendered nav, because the fault was spread
// over two components and a page, and the next one could be anywhere.
describe("internal links are lowercase", () => {
  // to="/Something". Query strings and template expressions are left alone -
  // a slug or a token is not ours to case.
  const CAPITALISED = /\bto=["']\/[a-z]*[A-Z]/g;

  test("nowhere in the client source", () => {
    const offenders = [];

    for (const file of sourceFiles()) {
      const found = fs.readFileSync(file, "utf8").match(CAPITALISED);
      if (found) {
        offenders.push(
          path.relative(ROOT, file).split(path.sep).join("/") + ": " + found.join(", ")
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  test("and the check recognises what it is looking for", () => {
    expect('to="/TipsPage"'.match(CAPITALISED)).not.toBeNull();
    expect('to="/tipspage"'.match(CAPITALISED)).toBeNull();
    expect('to={`/leaderboard?league=${slug}`}'.match(CAPITALISED)).toBeNull();
  });
});

// align is not a Grid prop.
//
// Grid forwards what it does not recognise to the div, so align="center"
// arrived in the DOM as the HTML 4 presentational attribute. Browsers still
// honour it, which is exactly why it went unnoticed - and one of these rendered
// per fixture, so a round put seven in the page.
//
// TableCell and Typography really do take an align prop, so this looks only at
// Grid. A blanket search would condemn two dozen legitimate uses.
describe("align is not passed to a Grid", () => {
  const GRID_ALIGN = /<Grid\b[^>]*\salign=/g;

  test("nowhere in the client source", () => {
    const offenders = [];

    for (const file of sourceFiles()) {
      const found = fs.readFileSync(file, "utf8").match(GRID_ALIGN);
      if (found) {
        offenders.push(
          path.relative(ROOT, file).split(path.sep).join("/") + " (" + found.length + ")"
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  test("and the check knows a Grid from a TableCell", () => {
    expect('<Grid size={6} align="right">'.match(GRID_ALIGN)).not.toBeNull();
    expect('<TableCell align="right">'.match(GRID_ALIGN)).toBeNull();
    expect('<Grid size={6} sx={{ textAlign: "right" }}>'.match(GRID_ALIGN)).toBeNull();
  });
});

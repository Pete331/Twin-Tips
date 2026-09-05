// That the page hands the card what the card reads.
//
// This exists because of a bug the rest of the suite could not see. The live
// quarter clock was added to FixtureCard and to FixtureCenterCard, both were
// tested, all the tests passed - and nothing appeared on the page, because
// TipsPage was never changed to pass `timestr` down. Every component test
// renders FixtureCard directly with a full set of props, so all of them stepped
// straight over the seam that was broken.
//
// The seam is a long list of props copied by hand from one file to another,
// which is exactly the kind of thing that drifts. This reads both files and
// checks they still agree.
//
// It is a source-level test, and that is a deliberate trade. The honest
// alternative is rendering TipsPage itself, which needs both contexts, the
// router and the whole API surface stubbed - worth doing one day, and not a
// reason to leave the seam unguarded until then.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// import.meta.url rather than __dirname: these are ES modules, and __dirname
// only happened to work because of the runner's interop.
const read = (relative) =>
  fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const cardSource = read("../../components/FixtureCard/index.jsx");
const pageSource = read("./index.jsx");

// The props FixtureCard destructures, taken from its parameter list.
const cardProps = () => {
  const params = cardSource.match(/const FixtureCard = \(\{([\s\S]*?)\}\) =>/);
  expect(params, "FixtureCard still destructures its props").toBeTruthy();

  return params[1]
    .split(",")
    .map((line) => line.replace(/\/\/.*$/gm, "").trim())
    .filter(Boolean)
    .map((entry) => entry.split(/[=:]/)[0].trim())
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
};

// The props TipsPage actually passes on the real fixture card.
const passedProps = () => {
  const start = pageSource.indexOf("<FixtureCard\n");
  expect(start, "TipsPage still renders a FixtureCard").toBeGreaterThan(-1);

  const block = pageSource.slice(start, pageSource.indexOf("/>", start));
  return [...block.matchAll(/^\s+([A-Za-z_$][\w$]*)=\{/gm)].map((m) => m[1]);
};

// Props FixtureCard names but TipsPage is not expected to supply. Each one is
// here because it has a reason, not because it was missing when this was
// written - a name added here without one is how this test stops working.
const NOT_FROM_THE_PAGE = new Set([
  // Squiggle's team abbreviations arrive on the populated team documents, and
  // the page passes those as aabrev and habrev instead.
]);

describe("TipsPage and FixtureCard agree on the props between them", () => {
  test("every prop the card reads is passed by the page", () => {
    const passed = new Set(passedProps());

    const missing = cardProps().filter(
      (name) => !passed.has(name) && !NOT_FROM_THE_PAGE.has(name)
    );

    expect(
      missing,
      `FixtureCard reads these and TipsPage never passes them: ${missing.join(", ")}`
    ).toEqual([]);
  });

  // The specific one that got through, named so the regression is unmistakable
  // rather than being one entry in a list.
  test("the live clock reaches the card", () => {
    expect(cardProps()).toContain("timestr");
    expect(passedProps()).toContain("timestr");
  });

  // Both halves have to be real for the test above to mean anything. If either
  // parser silently returned nothing, the comparison would pass on an empty
  // list and guard nothing at all.
  test("both files were actually parsed", () => {
    expect(cardProps().length).toBeGreaterThan(10);
    expect(passedProps().length).toBeGreaterThan(10);
  });
});

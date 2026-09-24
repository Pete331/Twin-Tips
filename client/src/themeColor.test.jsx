// The colour a phone paints its browser bar, and the app bar below it.
//
// index.html kept the template's black while the manifest and the Navbar were
// both #003b91, so on a phone a black strip sat on top of a blue bar (review
// finding #21). Three places say the colour; this keeps them saying the same.

import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file) =>
  fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("the browser bar, the installed app and the app bar are the same blue", () => {
  const meta = /<meta name="theme-color" content="([^"]+)"/.exec(
    read("index.html")
  );
  const manifest = JSON.parse(read("public/manifest.json"));
  // Either quote. This read the colour out of '...' alone, so the day
  // Prettier turned it into "..." the test failed on a colour that had not
  // changed.
  const navbar = /<AppBar[^>]*background:\s*["']([^"']+)["']/.exec(
    read("src/components/Navbar/index.jsx")
  );

  expect(meta && meta[1]).toBe("#003b91");
  expect(manifest.theme_color).toBe("#003b91");
  expect(navbar && navbar[1]).toBe("#003b91");
});

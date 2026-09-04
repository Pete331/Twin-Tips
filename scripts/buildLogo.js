// Writes the Twin Tips wordmark as a self-contained SVG.
//
//   node scripts/buildLogo.js
//
// The mark is your own: one T serving both words, its bar topping Twin and its
// stem standing in as the T of Tips. What changed is the execution - one
// typeface at one weight so the T and the smaller letters belong to the same
// alphabet, a twelve degree lean, and an even double ring instead of an outline
// that changed thickness as it went round.
//
// The font travels inside the file as a data URI rather than being referenced.
// A logo that depends on a webfont being loaded is a logo that renders wrong in
// an email, in a PDF, and on any machine that has not been told where to find
// it. Archivo Black is under the SIL Open Font License, which permits this.
//
// Replaces a 507x259 bitmap with three ellipses and four letters, and it scales.

const fs = require("fs");
const path = require("path");

const FONT = path.join(__dirname, "assets", "archivo-black.woff2");
const OUT = path.join(__dirname, "..", "client", "public", "assets", "logo.svg");

const NAVY = "#0c3c90";
const RED = "#fc1818";
const WHITE = "#fcfcfc";

const font = fs.readFileSync(FONT).toString("base64");

// The lockup is placed, scaled, and then leaned about its own centre - in that
// order - so the shear tilts it without also sliding it sideways.
//
// The nudge centres the drawn ink rather than the text's em box. Those are not
// the same thing: an em box carries the ascent and descent of letters this word
// never uses, so trusting it leaves the mark sitting high and right inside the
// oval. Measured off a raster of the letters alone, the ink sat 8.75 right and
// 7.25 high of centre; this puts it back.
const NUDGE_X = -8.75;
const NUDGE_Y = 7.25;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-label="Twin Tips">
  <title>Twin Tips</title>
  <defs>
    <style>
      @font-face {
        font-family: "TwinTipsDisplay";
        src: url(data:font/woff2;base64,${font}) format("woff2");
        font-weight: 400;
        font-style: normal;
      }
    </style>
  </defs>

  <!-- White field, navy band, and a red hairline hugging its outside edge.
       The hairline is what separates the mark from the navy header: a navy
       ring alone is the same colour as what it sits on. -->
  <ellipse cx="320" cy="160" rx="282" ry="128" fill="${WHITE}" stroke="${NAVY}" stroke-width="26"/>
  <ellipse cx="320" cy="160" rx="299" ry="145" fill="none" stroke="${RED}" stroke-width="8"/>

  <g transform="translate(${320 + NUDGE_X},${160 + NUDGE_Y}) scale(0.82) translate(-307,-178)">
    <g transform="translate(307,178) skewX(-12) translate(-307,-178)" font-family="TwinTipsDisplay, 'Archivo Black', sans-serif">
      <text x="112" y="252" font-size="252" fill="${RED}">T</text>
      <text x="248" y="150" font-size="128" fill="${NAVY}">win</text>
      <text x="248" y="256" font-size="128" fill="${NAVY}">ips</text>
    </g>
  </g>
</svg>
`;

fs.writeFileSync(OUT, svg);
console.log(`  ${Math.round(svg.length / 1024 * 10) / 10}KB  client/public/assets/logo.svg  (font embedded)`);

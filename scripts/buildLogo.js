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

const fs = require("fs");
const path = require("path");

const FONT = path.join(__dirname, "assets", "archivo-black.woff2");
const OUT = path.join(__dirname, "..", "client", "public", "assets", "logo.svg");

const NAVY = "#0c3c90";
const RED = "#fc1818";
const WHITE = "#fcfcfc";

// The badge is derived from the letters rather than the letters fitted into a
// badge, which is the mistake the first cut made: a 2.34:1 oval holding a
// 1.67:1 lockup left the letters filling 80% of the height but only 57% of the
// width. Since a header sizes a logo by its height, that spare width bought
// nothing - it just made the mark wide, and set the brand name smaller than the
// menu items beside it.
//
// Where the drawn letters actually sit, measured off a raster of the lockup
// with the rings removed - not the text's em box, which carries the ascent and
// descent of letters this word never uses, and which is why the first cut sat
// high and to the right.
const INK_DX = -10.67; // ink centre relative to the lockup's own origin
const INK_DY = 8.84;

// The white field is sized against the ink itself, not against its bounding
// box. Those give very different answers here, because the field is an ellipse:
// a rectangle inscribed in one reaches only 70.7% of each axis before its
// corners cross the curve. Sizing by the box said the letters filled 86% of the
// field comfortably; sizing against the ink showed 1% of it - a sliver across
// the top corners, the crossbar of the T and the shoulder of the n - already
// sitting on the navy band.
//
// So these are solved rather than chosen. For a given badge proportion, this is
// the smallest field that still holds every drawn pixel with 4% clear of the
// band, found by sweeping the lockup's ink as a point cloud against candidate
// ellipses. Re-derive them if the letters or the lean ever change.
//
// The proportion is 1.85:1 because a header constrains height, not width: a
// wider field lets the same letters sit lower in it, so widening the badge
// makes the letters bigger. Past about 2:1 that stops paying - another 15% of
// width buys 2% of letter - so this is the knee of the curve, not the maximum.
const FIELD_RX = 254.98; // half-axes of the white field, in lockup units at
const FIELD_RY = 137.83; // scale 1, measured with a 4% margin to the band

const BAND = 26;  // navy ring
const GAP = 17;   // white between the navy ring and the red hairline
const HAIR = 8;   // the hairline itself - what stops the mark dissolving into
                  // the navy header it sits on
const PAD = 6;    // breathing room outside the hairline
const SCALE = 0.82;

const rx = FIELD_RX * SCALE + BAND / 2;
const ry = FIELD_RY * SCALE + BAND / 2;
const hx = rx + GAP;
const hy = ry + GAP;
const W = Math.ceil((hx + HAIR / 2 + PAD) * 2);
const H = Math.ceil((hy + HAIR / 2 + PAD) * 2);
const cx = W / 2;
const cy = H / 2;

// Placed on the ink centre, scaled, then leaned about its own middle - in that
// order, so the shear tilts the lockup without also sliding it sideways.
const ox = cx + INK_DX * SCALE;
const oy = cy + INK_DY * SCALE;

const font = fs.readFileSync(FONT).toString(`base64`);

const r = (n) => Math.round(n * 100) / 100;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Twin Tips">
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

  <ellipse cx="${cx}" cy="${cy}" rx="${r(rx)}" ry="${r(ry)}" fill="${WHITE}" stroke="${NAVY}" stroke-width="${BAND}"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${r(hx)}" ry="${r(hy)}" fill="none" stroke="${RED}" stroke-width="${HAIR}"/>

  <g transform="translate(${r(ox)},${r(oy)}) scale(${SCALE}) translate(-307,-178)">
    <g transform="translate(307,178) skewX(-12) translate(-307,-178)" font-family="TwinTipsDisplay, 'Archivo Black', sans-serif">
      <text x="112" y="252" font-size="252" fill="${RED}">T</text>
      <text x="248" y="150" font-size="128" fill="${NAVY}">win</text>
      <text x="248" y="256" font-size="128" fill="${NAVY}">ips</text>
    </g>
  </g>
</svg>
`;

fs.writeFileSync(OUT, svg);
console.log(
  `  ${Math.round((svg.length / 1024) * 10) / 10}KB  client/public/assets/logo.svg  ${W}x${H}, font embedded`
);

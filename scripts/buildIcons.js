// Draws the Twin Tips app icon and writes every size the app needs.
//
//   node scripts/buildIcons.js
//
// The icon is two capital T's leaning together - white over red, on navy - and
// a capital T in a grotesque is a crossbar and a stem of equal weight. No
// curves, no serifs. So it is drawn from geometry here rather than typeset,
// which means the icon carries no font dependency and can be regenerated from
// this file whenever the brand changes.
//
// Everything is written by hand because the alternative is a native image
// dependency for what amounts to four rectangles: a small rasteriser with
// supersampled edges, and a PNG writer over the zlib that ships with Node.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "client", "public", "assets");

const NAVY = [12, 60, 144];   // #0c3c90
const RED = [252, 24, 24];    // #fc1818
const WHITE = [252, 252, 252]; // #fcfcfc

// The lean, agreed at twelve degrees. Enough to read as moving; little enough
// that the sheared stems keep their weight.
const SLANT = Math.tan((-12 * Math.PI) / 180);

// Held inside the 80% circle a maskable icon has to respect. Measured rather
// than guessed: at this scale the furthest drawn pixel sits 182 from the
// centre, against a safe radius of 205.
const SCALE = 0.92;

// The T's proportions, taken from the original wordmark: a bar 0.70 of the
// full height, and a stroke of 0.21.
const H = 210;
const BAR = H * 0.7;
const STROKE = H * 0.21;

// Each T as two axis-aligned rectangles, before the lean is applied.
const tee = (x, y) => [
  [x, y, BAR, STROKE],
  [x + (BAR - STROKE) / 2, y, STROKE, H],
];

const SHAPES = [
  { rects: tee(118, 133), colour: WHITE },
  { rects: tee(246, 169), colour: RED },
];

// Four samples across and down per pixel. Enough to keep a sheared edge smooth
// without the cost of anything cleverer.
const SS = 4;

const render = (size) => {
  const c = 256; // the design is laid out on a 512 grid, centred
  const px = Buffer.alloc(size * size * 3);

  // Navy everywhere first; the letters are drawn over it.
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = NAVY[0];
    px[i * 3 + 1] = NAVY[1];
    px[i * 3 + 2] = NAVY[2];
  }

  const unit = 512 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Coverage per colour, so an overlap resolves to whichever shape is on
      // top rather than blending into a third colour.
      let hit = null;
      let cover = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Sample point in the 512 design space.
          const X = (x + (sx + 0.5) / SS) * unit;
          const Y = (y + (sy + 0.5) / SS) * unit;

          // Undo the lean, then the scale, to land in the space the
          // rectangles are defined in.
          const u1 = X - (Y - c) * SLANT;
          const v1 = Y;
          const u = c + (u1 - c) / SCALE;
          const v = c + (v1 - c) / SCALE;

          // Later shapes win, matching the draw order.
          for (let s = SHAPES.length - 1; s >= 0; s--) {
            const inside = SHAPES[s].rects.some(
              ([rx, ry, rw, rh]) => u >= rx && u < rx + rw && v >= ry && v < ry + rh
            );
            if (inside) {
              if (hit === null || hit === s) { hit = s; cover++; }
              break;
            }
          }
        }
      }

      if (hit === null || cover === 0) continue;

      const a = cover / (SS * SS);
      const col = SHAPES[hit].colour;
      const i = (y * size + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        px[i + ch] = Math.round(NAVY[ch] * (1 - a) + col[ch] * a);
      }
    }
  }

  return px;
};

// ---- PNG ------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const png = (size, rgb) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  // 10, 11, 12 are compression, filter and interlace - all zero.

  // Filter byte 0 (none) in front of every scanline.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

// ---- ICO ------------------------------------------------------------------

// One file holding 16, 32 and 48, which is what a browser actually asks for.
// The current favicon is a single 337x337 image spending 21KB to draw sixteen
// pixels. PNG-compressed entries are read by every browser still in use.
const ico = (entries) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;

  entries.forEach((e, i) => {
    const at = i * 16;
    dir[at] = e.size >= 256 ? 0 : e.size;      // 0 means 256
    dir[at + 1] = e.size >= 256 ? 0 : e.size;
    dir[at + 2] = 0;                            // palette
    dir[at + 3] = 0;                            // reserved
    dir.writeUInt16LE(1, at + 4);               // colour planes
    dir.writeUInt16LE(32, at + 6);              // bits per pixel
    dir.writeUInt32BE(0, at + 8);
    dir.writeUInt32LE(e.data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += e.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
};

// ---- go -------------------------------------------------------------------

const SIZES = [512, 256, 192, 180, 48, 32, 16];

const made = {};
for (const size of SIZES) {
  made[size] = png(size, render(size));
}

const write = (name, buf) => {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`  ${String(Math.round(buf.length / 1024 * 10) / 10 + "KB").padStart(8)}  ${name}`);
};

write("icon-512.png", made[512]);
write("icon-256.png", made[256]);
write("icon-192.png", made[192]);
write("apple-touch-icon.png", made[180]);

const favicon = ico([
  { size: 16, data: made[16] },
  { size: 32, data: made[32] },
  { size: 48, data: made[48] },
]);
fs.writeFileSync(path.join(__dirname, "..", "client", "public", "favicon.ico"), favicon);
console.log(`  ${String(Math.round(favicon.length / 1024 * 10) / 10 + "KB").padStart(8)}  favicon.ico  (16, 32, 48)`);

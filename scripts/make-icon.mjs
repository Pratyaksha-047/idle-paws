#!/usr/bin/env node
// Renders icon.png (512x512) from the pet sprites: dog, cat and duck faces with pause bars
// above (paw + pause = Pawse) on a solid rounded tile.
//   node scripts/make-icon.mjs [#background] [output.png]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 512;
const BACKGROUND = process.argv[2] || '#f3e4cc';
const OUTPUT = process.argv[3] || 'icon.png';
// Head crops in sprite grid cells: [x0, y0, x1, y1] inclusive, from the sitting pose.
const FACES = [
  { species: 'dog', color: 'golden', crop: [9, 1, 19, 8], mirror: false },
  { species: 'cat', color: 'orange', crop: [10, 0, 18, 9], mirror: false },
  { species: 'duck', color: 'white', crop: [11, 3, 20, 9], mirror: true },
];

// sprites.js only touches `document` when rendering to canvas; the grids are pure.
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'web/overlay/sprites.js'), 'utf8'), sandbox);
const { SPECIES, palette } = sandbox.window.PetSprites;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const pixels = Buffer.alloc(SIZE * SIZE * 4);
const put = (x, y, [r, g, b], a = 255) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const alpha = a / 255;
  const under = alpha < 1 ? [pixels[i], pixels[i + 1], pixels[i + 2]] : [0, 0, 0];
  pixels[i] = Math.round(r * alpha + under[0] * (1 - alpha));
  pixels[i + 1] = Math.round(g * alpha + under[1] * (1 - alpha));
  pixels[i + 2] = Math.round(b * alpha + under[2] * (1 - alpha));
  pixels[i + 3] = Math.max(pixels[i + 3], a);
};

// Solid rounded tile (1px soft edge).
const RADIUS = 112;
const background = hex(BACKGROUND);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const cx = Math.min(Math.max(x, RADIUS), SIZE - 1 - RADIUS);
    const cy = Math.min(Math.max(y, RADIUS), SIZE - 1 - RADIUS);
    const edge = RADIUS - Math.hypot(x - cx, y - cy);
    if (edge > -1) put(x, y, background, Math.round(255 * Math.min(1, edge + 1)));
  }
}

// Pause bars, top centre.
const accent = hex('#d97757');
for (const bx of [218, 268]) {
  for (let y = 112; y < 188; y++) {
    for (let x = bx; x < bx + 26; x++) {
      const cx = Math.min(Math.max(x, bx + 8), bx + 17);
      const cy = Math.min(Math.max(y, 120), 179);
      if (Math.hypot(x - cx, y - cy) <= 8) put(x, y, accent);
    }
  }
}

// Faces cropped from the sprites, closed off with an outline row where the neck was cut,
// scaled with hard edges and bottom-aligned in a row.
const faces = FACES.map(({ species, color, crop: [x0, y0, x1, y1], mirror }) => {
  const grid = SPECIES[species].poses.sit({ tail: 'a', eyes: 'open' });
  const rows = grid.slice(y0, y1 + 1).map((row) => row.slice(x0, x1 + 1));
  rows.push(rows[rows.length - 1].map((c) => (c !== '.' && c !== 'o' ? 'o' : '.')));
  return { rows: mirror ? rows.map((row) => row.slice().reverse()) : rows, colors: palette(species, color) };
});
const GAP = 1;
const artWidth = faces.reduce((sum, f) => sum + f.rows[0].length, 0) + GAP * (faces.length - 1);
const artHeight = Math.max(...faces.map((f) => f.rows.length));
const scale = Math.floor(Math.min(460 / artWidth, 260 / artHeight));
const BASELINE = 404;
let cursor = Math.round(SIZE / 2 - (artWidth * scale) / 2);
faces.forEach(({ rows, colors }) => {
  const top = BASELINE - rows.length * scale;
  rows.forEach((row, gy) => row.forEach((c, gx) => {
    if (c === '.') return;
    const rgb = hex(colors[c]);
    for (let y = 0; y < scale; y++) {
      for (let x = 0; x < scale; x++) put(cursor + gx * scale + x, top + gy * scale + y, rgb);
    }
  }));
  cursor += (rows[0].length + GAP) * scale;
});

// Minimal PNG encoder (RGBA, no filtering).
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header.set([8, 6, 0, 0, 0], 8);
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(path.resolve(ROOT, OUTPUT), png);
console.log(`wrote ${OUTPUT} (${png.length} bytes, ${FACES.map((f) => f.species).join(' + ')}, scale ${scale})`);

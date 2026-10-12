#!/usr/bin/env node
// Renders icon.png (512x512) from the pet sprites: dog, duck and cat sitting together under
// a pixel game controller (pets + games) on a solid rounded tile.
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
// Back row first so the front pet draws over it. centerX/baseline in icon pixels.
const GROUP = [
  { species: 'dog', color: 'golden', scale: 10, centerX: 118, baseline: 396, mirror: false },
  { species: 'duck', color: 'white', scale: 10, centerX: 416, baseline: 396, mirror: true },
  { species: 'cat', color: 'orange', scale: 12, centerX: 252, baseline: 462, mirror: false },
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

// Pixel game controller, top centre, drawn like the sprites: shapes, then an automatic outline.
const PAD_W = 22;
const PAD_H = 12;
const pad = Array.from({ length: PAD_H }, () => Array(PAD_W).fill('.'));
const fill = (x0, y0, x1, y1, c, round = false) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
      if (!(round && corner)) pad[y][x] = c;
    }
  }
};
fill(3, 1, 18, 7, 'b', true);
fill(1, 4, 6, 10, 'b', true);
fill(15, 4, 20, 10, 'b', true);
const outlined = pad.map((row, y) => row.map((c, x) => {
  if (c !== '.') return c;
  const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (pad[y + dy] || [])[x + dx] && pad[y + dy][x + dx] !== '.');
  return touches ? 'o' : '.';
}));
const mark = (points, c) => points.forEach(([x, y]) => { outlined[y][x] = c; });
mark([[5, 3], [4, 4], [5, 4], [6, 4], [5, 5]], 'l');
mark([[16, 3], [15, 5], [17, 5], [16, 6]], 'p');
mark([[16, 3]], 'a');
mark([[9, 5], [12, 5]], 's');
mark([[2, 9], [3, 10], [4, 10], [16, 10], [17, 10], [19, 9]], 's');
const PAD_COLORS = { o: '#13323a', b: '#3e8e9a', s: '#2c6b75', l: '#fff6e6', p: '#f3a3ae', a: '#ffd36b' };
const PAD_SCALE = 10;
const padLeft = Math.round(SIZE / 2 - (PAD_W * PAD_SCALE) / 2);
const padTop = 44;
outlined.forEach((row, gy) => row.forEach((c, gx) => {
  if (c === '.') return;
  const rgb = hex(PAD_COLORS[c]);
  for (let y = 0; y < PAD_SCALE; y++) {
    for (let x = 0; x < PAD_SCALE; x++) put(padLeft + gx * PAD_SCALE + x, padTop + gy * PAD_SCALE + y, rgb);
  }
}));

// Each pet cropped to its own pixels and scaled with hard edges.
GROUP.forEach(({ species, color, scale, centerX, baseline, mirror }) => {
  const grid = SPECIES[species].poses.sit({ tail: 'a', eyes: 'happy' });
  const colors = palette(species, color);
  const cells = [];
  grid.forEach((row, y) => row.forEach((c, x) => c !== '.' && cells.push([x, y, c])));
  const minX = Math.min(...cells.map(([x]) => x));
  const maxX = Math.max(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const maxY = Math.max(...cells.map(([, y]) => y));
  const w = maxX - minX + 1;
  const left = Math.round(centerX - (w * scale) / 2);
  const top = baseline - (maxY - minY + 1) * scale;
  cells.forEach(([gx, gy, c]) => {
    const col = mirror ? w - 1 - (gx - minX) : gx - minX;
    const rgb = hex(colors[c]);
    for (let y = 0; y < scale; y++) {
      for (let x = 0; x < scale; x++) put(left + col * scale + x, top + (gy - minY) * scale + y, rgb);
    }
  });
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
console.log(`wrote ${OUTPUT} (${png.length} bytes, ${GROUP.map((p) => p.species).join(' + ')})`);

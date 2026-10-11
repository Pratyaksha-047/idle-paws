// Pixel cat sprites, generated from shape primitives with an automatic outline.
// Each frame is a GRID_W x GRID_H art grid, facing right; feet rest on the bottom row.
(function () {
  const GRID_W = 22;
  const GRID_H = 17;

  const PALETTES = {
    orange: { o: '#3a2417', b: '#e8954a', s: '#c26b28', l: '#fbe1bd', e: '#22160f', p: '#ef8f9f' },
    claude: { o: '#3b1d12', b: '#d97757', s: '#b85c3e', l: '#f2c9b4', e: '#21110b', p: '#f3a3ae' },
    gray: { o: '#26292d', b: '#9ea4ab', s: '#737a82', l: '#e4e7ea', e: '#1a1c1f', p: '#f0a0ac' },
    black: { o: '#060608', b: '#34343b', s: '#25252b', l: '#5c5c66', e: '#e9cf45', p: '#c97a88' },
    white: { o: '#55575c', b: '#f4f4f2', s: '#dcd9d2', l: '#ffffff', e: '#3b74c9', p: '#f2a3b0' },
  };

  const blank = () => Array.from({ length: GRID_H }, () => Array(GRID_W).fill('.'));

  const set = (g, x, y, c) => {
    if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) g[y][x] = c;
  };

  const rect = (g, x0, y0, x1, y1, c = 'b', round = false) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
        if (!(round && corner)) set(g, x, y, c);
      }
    }
  };

  const dots = (g, points, c) => points.forEach(([x, y]) => set(g, x, y, c));

  // Any empty pixel touching the silhouette (4-neighbourhood) becomes outline.
  const outline = (g) => {
    const out = g.map((row) => row.slice());
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (g[y][x] !== '.') continue;
        const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const v = g[y + dy] && g[y + dy][x + dx];
          return v && v !== '.';
        });
        if (touches) out[y][x] = 'o';
      }
    }
    return out;
  };

  const TAILS = {
    up: [[4, 10], [3, 9], [3, 8], [2, 7], [2, 6], [2, 5]],
    sway: [[4, 10], [3, 9], [2, 8], [2, 7], [2, 6], [3, 5]],
    down: [[4, 10], [3, 11], [2, 12], [2, 13]],
  };

  // Standing / walking cat. legs: x of each 2px-wide leg; lift: indices drawn one pixel shorter.
  const stand = ({ legs, lift = [], tail = 'up', eyes = 'open', headDy = 0 }) => {
    const g = blank();
    rect(g, 5, 9, 15, 13, 'b', true);
    rect(g, 14, 4 + headDy, 19, 9 + headDy, 'b', true);
    dots(g, [[14, 3 + headDy], [14, 2 + headDy], [15, 3 + headDy], [19, 3 + headDy], [19, 2 + headDy], [18, 3 + headDy]], 'b');
    legs.forEach((x, i) => rect(g, x, 14, x + 1, lift.includes(i) ? 14 : 15, 'b'));
    dots(g, TAILS[tail], 'b');
    const o = outline(g);
    dots(o, [[8, 9], [8, 10], [11, 9], [11, 10]], 's');
    dots(o, [[16, 4 + headDy], [17, 4 + headDy]], 's');
    for (let x = 7; x <= 13; x++) set(o, x, 13, 'l');
    legs.forEach((x, i) => {
      const y = lift.includes(i) ? 14 : 15;
      dots(o, [[x, y], [x + 1, y]], 'l');
    });
    dots(o, [[14, 3 + headDy], [19, 3 + headDy]], 'p');
    face(o, 15, 6 + headDy, eyes);
    return o;
  };

  // Eyes at (ex, ey) and (ex + 2, ey); nose and muzzle below.
  const face = (g, ex, ey, eyes) => {
    if (eyes === 'open') dots(g, [[ex, ey], [ex, ey + 1], [ex + 2, ey], [ex + 2, ey + 1]], 'e');
    if (eyes === 'closed') dots(g, [[ex, ey + 1], [ex + 2, ey + 1]], 'e');
    if (eyes === 'happy') dots(g, [[ex, ey], [ex + 2, ey]], 'e');
    dots(g, [[ex, ey + 2], [ex + 2, ey + 2]], 'l');
    set(g, ex + 1, ey + 2, 'p');
  };

  const sit = ({ tail = 'a', eyes = 'open' }) => {
    const g = blank();
    rect(g, 6, 11, 13, 15, 'b', true);
    rect(g, 11, 8, 16, 15, 'b');
    rect(g, 11, 3, 17, 9, 'b', true);
    dots(g, [[11, 2], [11, 1], [12, 2], [17, 2], [17, 1], [16, 2]], 'b');
    dots(g, tail === 'a' ? [[5, 15], [4, 15], [3, 15], [2, 14], [2, 13]] : [[5, 15], [4, 15], [3, 14], [3, 13], [3, 12]], 'b');
    const o = outline(g);
    dots(o, [[13, 3], [14, 3], [15, 3]], 's');
    dots(o, [[8, 12], [9, 11]], 's');
    for (let y = 10; y <= 14; y++) dots(o, [[14, y], [15, y]], 'l');
    dots(o, [[13, 15], [14, 15], [16, 15]], 'l');
    dots(o, [[11, 2], [17, 2]], 'p');
    face(o, 13, 5, eyes);
    return o;
  };

  const sleep = ({ breath = 0 }) => {
    const g = blank();
    rect(g, 4, 10 + breath, 15, 15, 'b', true);
    rect(g, 12, 9 + breath, 18, 14, 'b', true);
    dots(g, [[12, 8 + breath], [13, 8 + breath], [18, 8 + breath], [17, 8 + breath]], 'b');
    dots(g, [[3, 14], [3, 15]], 'b');
    const o = outline(g);
    dots(o, [[7, 10 + breath], [10, 10 + breath], [7, 11 + breath], [10, 11 + breath]], 's');
    for (let x = 5; x <= 12; x++) set(o, x, 15, 's');
    dots(o, [[12, 8 + breath], [18, 8 + breath]], 'p');
    face(o, 14, 10 + breath, 'closed');
    return o;
  };

  const FRAMES = {
    walk: [
      stand({ legs: [6, 9, 12, 15], lift: [1, 2], tail: 'up' }),
      stand({ legs: [7, 8, 13, 14], tail: 'sway', headDy: 0 }),
      stand({ legs: [6, 9, 12, 15], lift: [0, 3], tail: 'up' }),
      stand({ legs: [7, 8, 13, 14], tail: 'sway', headDy: 0 }),
    ],
    stand: [stand({ legs: [6, 9, 12, 15], tail: 'up' })],
    drag: [stand({ legs: [6, 9, 12, 15], tail: 'down', eyes: 'open' })],
    sit: [sit({ tail: 'a' }), sit({ tail: 'b' })],
    blink: [sit({ tail: 'a', eyes: 'closed' })],
    happy: [sit({ tail: 'a', eyes: 'happy' }), sit({ tail: 'b', eyes: 'happy' })],
    sleep: [sleep({ breath: 0 }), sleep({ breath: 1 })],
  };

  // Mouth position (art pixels) for carrying the ball, per pose.
  const MOUTH = { walk: [20, 10], stand: [20, 10] };

  const cache = new Map();

  const render = (grid, palette) => {
    const canvas = document.createElement('canvas');
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    const ctx = canvas.getContext('2d');
    grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === '.') return;
        ctx.fillStyle = palette[c];
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    return canvas;
  };

  const frame = (color, pose, index) => {
    const key = `${color}:${pose}:${index}`;
    if (!cache.has(key)) {
      const frames = FRAMES[pose] || FRAMES.sit;
      cache.set(key, render(frames[index % frames.length], PALETTES[color] || PALETTES.orange));
    }
    return cache.get(key);
  };

  const frameCount = (pose) => (FRAMES[pose] || FRAMES.sit).length;

  const PAW = [
    '.o.o.',
    'obobo',
    '.ooo.',
    'obbbo',
    'obbbo',
    '.ooo.',
  ];

  const paw = (color) => {
    const palette = PALETTES[color] || PALETTES.orange;
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 6;
    const ctx = canvas.getContext('2d');
    PAW.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '.') return;
        ctx.fillStyle = palette[c];
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    return canvas;
  };

  window.PetSprites = { GRID_W, GRID_H, PALETTES, MOUTH, frame, frameCount, paw };
})();

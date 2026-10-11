// Pixel pet sprites, generated from shape primitives with an automatic outline.
// Each frame is a GRID_W x GRID_H art grid, facing right; feet rest on the bottom row.
// Palette keys: o outline, b body, h head, s shade/marking, l light, e eye, p pink, k accent (beak, feet, dog ear).
(function () {
  const GRID_W = 22;
  const GRID_H = 17;

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

  // Eyes at (ex, ey) and (ex + 2, ey) with a muzzle below.
  const catFace = (g, ex, ey, eyes) => {
    if (eyes === 'open') dots(g, [[ex, ey], [ex, ey + 1], [ex + 2, ey], [ex + 2, ey + 1]], 'e');
    if (eyes === 'closed') dots(g, [[ex, ey + 1], [ex + 2, ey + 1]], 'e');
    if (eyes === 'happy') dots(g, [[ex, ey], [ex + 2, ey]], 'e');
    dots(g, [[ex, ey + 2], [ex + 2, ey + 2]], 'l');
    set(g, ex + 1, ey + 2, 'p');
  };

  const legs = (g, xs, lift, color = 'b', top = 14) =>
    xs.forEach((x, i) => rect(g, x, top, x + 1, lift.includes(i) ? 14 : 15, color));

  const WALK_LEGS = [
    { xs: [6, 9, 12, 15], lift: [1, 2] },
    { xs: [7, 8, 13, 14], lift: [] },
    { xs: [6, 9, 12, 15], lift: [0, 3] },
    { xs: [7, 8, 13, 14], lift: [] },
  ];

  // ---------------------------------------------------------------- cat

  const CAT_TAILS = {
    up: [[4, 10], [3, 9], [3, 8], [2, 7], [2, 6], [2, 5]],
    sway: [[4, 10], [3, 9], [2, 8], [2, 7], [2, 6], [3, 5]],
    down: [[4, 10], [3, 11], [2, 12], [2, 13]],
  };

  const cat = {
    stand: ({ legs: legSpec, tail = 'up', eyes = 'open' }) => {
      const g = blank();
      rect(g, 5, 9, 15, 13, 'b', true);
      rect(g, 14, 4, 19, 9, 'b', true);
      dots(g, [[14, 3], [14, 2], [15, 3], [19, 3], [19, 2], [18, 3]], 'b');
      legs(g, legSpec.xs, legSpec.lift);
      dots(g, CAT_TAILS[tail], 'b');
      const o = outline(g);
      dots(o, [[8, 9], [8, 10], [11, 9], [11, 10], [16, 4], [17, 4]], 's');
      for (let x = 7; x <= 13; x++) set(o, x, 13, 'l');
      legSpec.xs.forEach((x, i) => {
        const y = legSpec.lift.includes(i) ? 14 : 15;
        dots(o, [[x, y], [x + 1, y]], 'l');
      });
      dots(o, [[14, 3], [19, 3]], 'p');
      catFace(o, 15, 6, eyes);
      return o;
    },
    sit: ({ tail = 'a', eyes = 'open' }) => {
      const g = blank();
      rect(g, 6, 11, 13, 15, 'b', true);
      rect(g, 11, 8, 16, 15, 'b');
      rect(g, 11, 3, 17, 9, 'b', true);
      dots(g, [[11, 2], [11, 1], [12, 2], [17, 2], [17, 1], [16, 2]], 'b');
      dots(g, tail === 'a' ? [[5, 15], [4, 15], [3, 15], [2, 14], [2, 13]] : [[5, 15], [4, 15], [3, 14], [3, 13], [3, 12]], 'b');
      const o = outline(g);
      dots(o, [[13, 3], [14, 3], [15, 3], [8, 12], [9, 11]], 's');
      for (let y = 10; y <= 14; y++) dots(o, [[14, y], [15, y]], 'l');
      dots(o, [[13, 15], [14, 15], [16, 15]], 'l');
      dots(o, [[11, 2], [17, 2]], 'p');
      catFace(o, 13, 5, eyes);
      return o;
    },
    sleep: ({ breath = 0 }) => {
      const g = blank();
      rect(g, 4, 10 + breath, 15, 15, 'b', true);
      rect(g, 12, 9 + breath, 18, 14, 'b', true);
      dots(g, [[12, 8 + breath], [13, 8 + breath], [18, 8 + breath], [17, 8 + breath], [3, 14], [3, 15]], 'b');
      const o = outline(g);
      dots(o, [[7, 10 + breath], [10, 10 + breath], [7, 11 + breath], [10, 11 + breath]], 's');
      for (let x = 5; x <= 12; x++) set(o, x, 15, 's');
      dots(o, [[12, 8 + breath], [18, 8 + breath]], 'p');
      catFace(o, 14, 10 + breath, 'closed');
      return o;
    },
  };

  // ---------------------------------------------------------------- dog

  const DOG_TAILS = { a: [[4, 9], [3, 8], [3, 7], [2, 6]], b: [[4, 9], [3, 8], [2, 8], [1, 7]] };

  const dogFace = (g, ex, ey, eyes, tongue) => {
    if (eyes === 'open') dots(g, [[ex, ey], [ex, ey + 1]], 'e');
    if (eyes === 'closed') set(g, ex, ey + 1, 'e');
    if (eyes === 'happy') set(g, ex, ey, 'e');
    if (tongue) set(g, ex + 3, ey + 3, 'p');
  };

  const dog = {
    stand: ({ legs: legSpec, tail = 'a', eyes = 'open' }) => {
      const g = blank();
      rect(g, 5, 8, 15, 12, 'b', true);
      rect(g, 13, 3, 18, 8, 'b', true);
      rect(g, 18, 5, 20, 8, 'b', true);
      dots(g, [[13, 4], [12, 5], [12, 6], [12, 7]], 'b');
      legs(g, legSpec.xs, legSpec.lift, 'b', 13);
      dots(g, DOG_TAILS[tail === 'sway' ? 'b' : 'a'], 'b');
      const o = outline(g);
      dots(o, [[13, 4], [14, 4], [12, 5], [13, 5], [12, 6], [13, 6], [12, 7], [13, 7]], 'k');
      for (let x = 7; x <= 13; x++) set(o, x, 12, 'l');
      dots(o, [[18, 7], [19, 7], [18, 8]], 'l');
      set(o, 20, 5, 'e');
      dogFace(o, 17, 4, eyes, eyes === 'happy');
      return o;
    },
    sit: ({ tail = 'a', eyes = 'open' }) => {
      const g = blank();
      rect(g, 6, 11, 13, 15, 'b', true);
      rect(g, 11, 8, 15, 15, 'b');
      rect(g, 11, 2, 16, 7, 'b', true);
      rect(g, 16, 4, 18, 7, 'b', true);
      dots(g, [[11, 3], [10, 4], [10, 5], [10, 6]], 'b');
      dots(g, tail === 'a' ? [[5, 14], [4, 13], [3, 12]] : [[5, 14], [4, 14], [3, 13]], 'b');
      const o = outline(g);
      dots(o, [[11, 3], [12, 3], [10, 4], [11, 4], [10, 5], [11, 5], [10, 6], [11, 6]], 'k');
      for (let y = 9; y <= 14; y++) dots(o, [[14, y], [15, y]], 'l');
      dots(o, [[16, 6], [17, 6], [16, 7]], 'l');
      set(o, 18, 4, 'e');
      dogFace(o, 15, 3, eyes, eyes === 'happy');
      return o;
    },
    sleep: ({ breath = 0 }) => {
      const g = blank();
      rect(g, 4, 10 + breath, 15, 15, 'b', true);
      rect(g, 12, 10 + breath, 17, 14, 'b', true);
      rect(g, 17, 12 + breath, 19, 14, 'b', true);
      dots(g, [[3, 14], [3, 15]], 'b');
      const o = outline(g);
      dots(o, [[12, 10 + breath], [13, 10 + breath], [12, 11 + breath], [13, 11 + breath], [12, 12 + breath]], 'k');
      set(o, 19, 12 + breath, 'e');
      set(o, 16, 12 + breath, 'e');
      return o;
    },
  };

  // ---------------------------------------------------------------- duck

  const duck = {
    stand: ({ legs: legSpec, eyes = 'open' }) => {
      const g = blank();
      rect(g, 6, 8, 15, 13, 'b', true);
      rect(g, 13, 2, 17, 8, 'h', true);
      rect(g, 18, 5, 20, 6, 'k');
      dots(g, [[5, 8], [4, 7]], 'b');
      const [a, b] = legSpec.xs[0] === 6 ? [9, 12] : [10, 11];
      dots(g, [[a, 14], [a, 15], [a + 1, 15], [b, 14], [b, 15], [b + 1, 15]], 'k');
      const o = outline(g);
      for (let x = 8; x <= 12; x++) dots(o, [[x, 9], [x, 10]], 's');
      dots(o, [[7, 12], [8, 13], [9, 13]], 'l');
      if (eyes === 'open') dots(o, [[16, 4], [16, 5]], 'e');
      else set(o, 16, eyes === 'happy' ? 4 : 5, 'e');
      return o;
    },
    sit: ({ eyes = 'open', tail = 'a' }) => {
      const g = blank();
      rect(g, 6, 10, 15, 15, 'b', true);
      rect(g, 12, 4, 16, 10, 'h', true);
      rect(g, 17, 7, 19, 8, 'k');
      dots(g, tail === 'a' ? [[5, 10], [4, 9]] : [[5, 10], [4, 10]], 'b');
      const o = outline(g);
      for (let x = 8; x <= 12; x++) dots(o, [[x, 11], [x, 12]], 's');
      dots(o, [[7, 14], [8, 15], [9, 15]], 'l');
      if (eyes === 'open') dots(o, [[15, 6], [15, 7]], 'e');
      else set(o, 15, eyes === 'happy' ? 6 : 7, 'e');
      return o;
    },
    sleep: ({ breath = 0 }) => {
      const g = blank();
      rect(g, 5, 10 + breath, 15, 15, 'b', true);
      rect(g, 12, 8 + breath, 15, 11 + breath, 'h', true);
      rect(g, 16, 10 + breath, 17, 10 + breath, 'k');
      dots(g, [[4, 10 + breath], [3, 9 + breath]], 'b');
      const o = outline(g);
      for (let x = 7; x <= 11; x++) dots(o, [[x, 11 + breath], [x, 12 + breath]], 's');
      set(o, 14, 10 + breath, 'e');
      return o;
    },
  };

  // ---------------------------------------------------------------- registry

  const framesFor = (poses) => ({
    walk: WALK_LEGS.map((spec, i) => poses.stand({ legs: spec, tail: i % 2 ? 'sway' : 'up' })),
    stand: [poses.stand({ legs: { xs: [6, 9, 12, 15], lift: [] }, tail: 'up' })],
    drag: [poses.stand({ legs: { xs: [6, 9, 12, 15], lift: [] }, tail: 'down' })],
    sit: [poses.sit({ tail: 'a' }), poses.sit({ tail: 'b' })],
    blink: [poses.sit({ tail: 'a', eyes: 'closed' })],
    happy: [poses.sit({ tail: 'a', eyes: 'happy' }), poses.sit({ tail: 'b', eyes: 'happy' })],
    sleep: [poses.sleep({ breath: 0 }), poses.sleep({ breath: 1 })],
  });

  const SPECIES = {
    cat: {
      label: '🐱 Cat',
      poses: cat,
      mouth: [20, 10],
      palettes: {
        orange: { o: '#3a2417', b: '#e8954a', s: '#c26b28', l: '#fbe1bd', e: '#22160f', p: '#ef8f9f' },
        claude: { o: '#3b1d12', b: '#d97757', s: '#b85c3e', l: '#f2c9b4', e: '#21110b', p: '#f3a3ae' },
        gray: { o: '#26292d', b: '#9ea4ab', s: '#737a82', l: '#e4e7ea', e: '#1a1c1f', p: '#f0a0ac' },
        black: { o: '#060608', b: '#34343b', s: '#25252b', l: '#5c5c66', e: '#e9cf45', p: '#c97a88' },
        white: { o: '#55575c', b: '#f4f4f2', s: '#dcd9d2', l: '#ffffff', e: '#3b74c9', p: '#f2a3b0' },
      },
    },
    dog: {
      label: '🐶 Dog',
      poses: dog,
      mouth: [21, 9],
      palettes: {
        golden: { o: '#3a2410', b: '#e0a858', k: '#9a5a24', l: '#f7dfb4', e: '#1d140c', p: '#ef7f8f' },
        brown: { o: '#24150c', b: '#8a5a36', k: '#4a2c16', l: '#d9b48c', e: '#120b06', p: '#ef7f8f' },
        spotty: { o: '#3a3a3a', b: '#f3f1ec', k: '#2d2d30', l: '#ffffff', e: '#1a1a1a', p: '#ef7f8f' },
        black: { o: '#050506', b: '#2c2c31', k: '#141417', l: '#b07a4a', e: '#e9d6a0', p: '#ef7f8f' },
      },
    },
    duck: {
      label: '🦆 Duck',
      poses: duck,
      mouth: [21, 7],
      palettes: {
        white: { o: '#4a4a4a', b: '#f4f4f2', h: '#f4f4f2', s: '#d8d6cf', l: '#ffffff', e: '#1d1d1d', k: '#f0a030' },
        duckling: { o: '#5a4410', b: '#f5d547', h: '#f5d547', s: '#e0b92f', l: '#fbe98a', e: '#1d1d1d', k: '#f08a24' },
        mallard: { o: '#2a2620', b: '#9c8f7c', h: '#2f7d4f', s: '#6f6455', l: '#d8cfc0', e: '#111111', k: '#e8b030' },
      },
    },
  };

  const framesCache = new Map();
  const canvasCache = new Map();

  const speciesOf = (name) => SPECIES[name] || SPECIES.cat;

  const palette = (species, color) => {
    const palettes = speciesOf(species).palettes;
    const chosen = palettes[color] || Object.values(palettes)[0];
    return Object.assign({ h: chosen.b, k: chosen.o, s: chosen.b, l: chosen.b, p: chosen.b }, chosen);
  };

  const framesOf = (species) => {
    if (!framesCache.has(species)) framesCache.set(species, framesFor(speciesOf(species).poses));
    return framesCache.get(species);
  };

  const render = (grid, colors) => {
    const canvas = document.createElement('canvas');
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    const ctx = canvas.getContext('2d');
    grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === '.') return;
        ctx.fillStyle = colors[c];
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    return canvas;
  };

  const frame = (species, color, pose, index) => {
    const key = `${species}:${color}:${pose}:${index}`;
    if (!canvasCache.has(key)) {
      const frames = framesOf(species)[pose] || framesOf(species).sit;
      canvasCache.set(key, render(frames[index % frames.length], palette(species, color)));
    }
    return canvasCache.get(key);
  };

  const frameCount = (species, pose) => (framesOf(species)[pose] || framesOf(species).sit).length;

  const PAW = ['.o.o.', 'obobo', '.ooo.', 'obbbo', 'obbbo', '.ooo.'];

  const paw = (species, color) => {
    const colors = palette(species, color);
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 6;
    const ctx = canvas.getContext('2d');
    PAW.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '.') return;
        ctx.fillStyle = colors[c];
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    return canvas;
  };

  window.PetSprites = { GRID_W, GRID_H, SPECIES, palette, frame, frameCount, paw };
})();

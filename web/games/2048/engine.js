// Pure 2048 game logic. Grids are SIZE x SIZE arrays of numbers (0 = empty).
export const SIZE = 4;
export const WIN_TILE = 2048;
export const DIRECTIONS = ['left', 'right', 'up', 'down'];

export const emptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

export const cloneGrid = (grid) => grid.map((row) => row.slice());

// Slides one line toward index 0, merging each pair at most once.
export const slideLine = (line) => {
  const tiles = line.filter((v) => v !== 0);
  const out = [];
  let score = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      out.push(merged);
      score += merged;
      i++;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < line.length) out.push(0);
  return { line: out, score, moved: out.some((v, i) => v !== line[i]) };
};

// Cell coordinates of line i, ordered from the edge tiles slide toward.
const lineCoords = (i, dir) => {
  const steps = [...Array(SIZE).keys()];
  switch (dir) {
    case 'left':
      return steps.map((k) => [i, k]);
    case 'right':
      return steps.map((k) => [i, SIZE - 1 - k]);
    case 'up':
      return steps.map((k) => [k, i]);
    case 'down':
      return steps.map((k) => [SIZE - 1 - k, i]);
    default:
      throw new Error(`unknown direction: ${dir}`);
  }
};

export const move = (grid, dir) => {
  const next = emptyGrid();
  let score = 0;
  let moved = false;
  for (let i = 0; i < SIZE; i++) {
    const coords = lineCoords(i, dir);
    const result = slideLine(coords.map(([r, c]) => grid[r][c]));
    result.line.forEach((v, k) => {
      const [r, c] = coords[k];
      next[r][c] = v;
    });
    score += result.score;
    moved = moved || result.moved;
  }
  return { grid: next, score, moved };
};

export const emptyCells = (grid) => {
  const cells = [];
  grid.forEach((row, r) => row.forEach((v, c) => v === 0 && cells.push([r, c])));
  return cells;
};

export const addRandomTile = (grid, rand = Math.random) => {
  const cells = emptyCells(grid);
  if (cells.length === 0) return { grid, cell: null };
  const [r, c] = cells[Math.floor(rand() * cells.length)];
  const next = cloneGrid(grid);
  next[r][c] = rand() < 0.9 ? 2 : 4;
  return { grid: next, cell: [r, c] };
};

export const canMove = (grid) => DIRECTIONS.some((dir) => move(grid, dir).moved);

export const maxTile = (grid) => Math.max(...grid.flat());

export const newGame = (rand = Math.random) => {
  const first = addRandomTile(emptyGrid(), rand);
  return addRandomTile(first.grid, rand).grid;
};

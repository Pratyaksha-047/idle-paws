// Sudoku logic. Grids are flat arrays of 81 numbers, 0 = empty.
export const SIZE = 9;
export const CELLS = SIZE * SIZE;
export const DIFFICULTY = { easy: 40, medium: 32, hard: 26 };

const rowOf = (i) => Math.floor(i / SIZE);
const colOf = (i) => i % SIZE;
const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

// PEERS[i]: the 20 cells sharing a row, column or box with cell i.
export const PEERS = Array.from({ length: CELLS }, (_, i) =>
  [...Array(CELLS).keys()].filter(
    (j) => j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)),
  ),
);

const shuffle = (items, rand) => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const candidates = (grid, i) => {
  let used = 0;
  for (const p of PEERS[i]) used |= 1 << grid[p];
  const out = [];
  for (let v = 1; v <= SIZE; v++) if (!(used & (1 << v))) out.push(v);
  return out;
};

// Backtracking search, always branching on the empty cell with the fewest candidates.
const search = (grid, limit, state, rand) => {
  let best = -1;
  let bestCandidates = null;
  for (let i = 0; i < CELLS; i++) {
    if (grid[i] !== 0) continue;
    const c = candidates(grid, i);
    if (c.length === 0) return;
    if (best === -1 || c.length < bestCandidates.length) {
      best = i;
      bestCandidates = c;
      if (c.length === 1) break;
    }
  }
  if (best === -1) {
    state.count++;
    if (!state.first) state.first = grid.slice();
    return;
  }
  for (const v of rand ? shuffle(bestCandidates, rand) : bestCandidates) {
    grid[best] = v;
    search(grid, limit, state, rand);
    if (state.count >= limit) break;
  }
  grid[best] = 0;
};

export const countSolutions = (grid, limit = 2) => {
  const state = { count: 0, first: null };
  search(grid.slice(), limit, state, null);
  return state.count;
};

export const solve = (grid) => {
  const state = { count: 0, first: null };
  search(grid.slice(), 1, state, null);
  return state.first;
};

export const generateSolved = (rand = Math.random) => {
  const state = { count: 0, first: null };
  search(Array(CELLS).fill(0), 1, state, rand);
  return state.first;
};

// Removes clues in random order while the puzzle keeps exactly one solution.
export const generate = (difficulty = 'easy', rand = Math.random) => {
  const target = DIFFICULTY[difficulty];
  if (!target) throw new Error(`unknown difficulty: ${difficulty}`);
  const solution = generateSolved(rand);
  const puzzle = solution.slice();
  let clues = CELLS;
  for (const i of shuffle([...Array(CELLS).keys()], rand)) {
    if (clues <= target) break;
    const kept = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) === 1) clues--;
    else puzzle[i] = kept;
  }
  return { puzzle, solution };
};

// Indices of filled cells that clash with a peer holding the same digit.
export const conflicts = (grid) => {
  const out = new Set();
  grid.forEach((v, i) => {
    if (v !== 0 && PEERS[i].some((p) => grid[p] === v)) out.add(i);
  });
  return out;
};

export const isSolved = (grid, solution) => grid.every((v, i) => v === solution[i]);

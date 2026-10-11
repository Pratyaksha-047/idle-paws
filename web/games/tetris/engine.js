// Tetris logic: 10x20 board, 7-bag randomiser, simple wall/floor kicks.
export const COLS = 10;
export const ROWS = 20;
export const LINE_SCORES = [0, 100, 300, 500, 800];

export const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

export const rotateMatrix = (matrix, dir = 1) =>
  dir > 0
    ? matrix[0].map((_, c) => matrix.map((row) => row[c]).reverse())
    : matrix[0].map((_, c) => matrix.map((row) => row[row.length - 1 - c]));

export const cellsOf = ({ matrix, x, y }) => {
  const out = [];
  matrix.forEach((row, r) => row.forEach((v, c) => v && out.push([x + c, y + r])));
  return out;
};

export const collides = (board, piece) =>
  cellsOf(piece).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]));

const shuffle = (items, rand) => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const refill = (state, rand) => {
  while (state.queue.length < 7) state.queue.push(...shuffle(Object.keys(SHAPES), rand));
};

const spawn = (state, rand) => {
  refill(state, rand);
  const type = state.queue.shift();
  const matrix = SHAPES[type];
  state.piece = { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: type === 'I' ? -1 : 0 };
  if (collides(state.board, state.piece)) state.over = true;
};

export const newGame = (rand = Math.random) => {
  const state = {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    queue: [],
    piece: null,
    score: 0,
    lines: 0,
    level: 1,
    over: false,
  };
  spawn(state, rand);
  return state;
};

export const next = (state) => state.queue[0];

const tryMove = (state, dx, dy, matrix = state.piece.matrix) => {
  const moved = { ...state.piece, matrix, x: state.piece.x + dx, y: state.piece.y + dy };
  if (collides(state.board, moved)) return false;
  state.piece = moved;
  return true;
};

export const move = (state, dx) => !state.over && tryMove(state, dx, 0);

export const rotate = (state, dir = 1) => {
  if (state.over || state.piece.type === 'O') return false;
  const matrix = rotateMatrix(state.piece.matrix, dir);
  return KICKS.some(([kx, ky]) => tryMove(state, kx, ky, matrix));
};

const clearLines = (state) => {
  const kept = state.board.filter((row) => row.some((cell) => !cell));
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  state.board = kept;
  state.lines += cleared;
  state.score += LINE_SCORES[cleared] * state.level;
  state.level = 1 + Math.floor(state.lines / 10);
  return cleared;
};

const lock = (state, rand) => {
  const cells = cellsOf(state.piece);
  if (cells.some(([, y]) => y < 0)) {
    state.over = true;
    return 0;
  }
  cells.forEach(([x, y]) => {
    state.board[y][x] = state.piece.type;
  });
  const cleared = clearLines(state);
  spawn(state, rand);
  return cleared;
};

// Gravity step: move down or lock. Returns lines cleared (0 when only moved).
export const tick = (state, rand = Math.random) => {
  if (state.over) return 0;
  return tryMove(state, 0, 1) ? 0 : lock(state, rand);
};

export const softDrop = (state, rand = Math.random) => {
  if (state.over) return 0;
  if (tryMove(state, 0, 1)) {
    state.score += 1;
    return 0;
  }
  return lock(state, rand);
};

export const hardDrop = (state, rand = Math.random) => {
  if (state.over) return 0;
  let distance = 0;
  while (tryMove(state, 0, 1)) distance++;
  state.score += distance * 2;
  return lock(state, rand);
};

export const ghostY = (state) => {
  let y = state.piece.y;
  while (!collides(state.board, { ...state.piece, y: y + 1 })) y++;
  return y;
};

export const dropMs = (level) => Math.max(80, Math.round(800 * 0.85 ** (level - 1)));

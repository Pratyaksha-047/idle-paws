// Minesweeper logic. Cells are a flat array of { mine, adjacent, open, flag }.
export const LEVELS = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 12, cols: 12, mines: 24 },
  hard: { rows: 16, cols: 16, mines: 40 },
};

export const neighbours = (board, i) => {
  const { rows, cols } = board;
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if ((dr || dc) && nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
};

// Mines are placed on the first reveal, avoiding that cell and its neighbours.
export const createBoard = (level) => {
  const spec = LEVELS[level];
  if (!spec) throw new Error(`unknown level: ${level}`);
  const cells = Array.from({ length: spec.rows * spec.cols }, () => ({ mine: false, adjacent: 0, open: false, flag: false }));
  return { ...spec, level, cells, placed: false, lost: false, won: false };
};

export const placeMines = (board, safeIndex, rand = Math.random) => {
  const forbidden = new Set([safeIndex, ...neighbours(board, safeIndex)]);
  const pool = board.cells.map((_, i) => i).filter((i) => !forbidden.has(i));
  for (let k = 0; k < board.mines && pool.length; k++) {
    const pick = Math.floor(rand() * pool.length);
    board.cells[pool[pick]].mine = true;
    pool.splice(pick, 1);
  }
  board.cells.forEach((cell, i) => {
    cell.adjacent = neighbours(board, i).filter((n) => board.cells[n].mine).length;
  });
  board.placed = true;
};

const checkWin = (board) => {
  if (board.cells.every((cell) => cell.mine || cell.open)) {
    board.won = true;
    board.cells.forEach((cell) => {
      if (cell.mine) cell.flag = true;
    });
  }
};

// Opens a cell, flood-filling through zeros. Returns false when a mine was hit.
export const reveal = (board, index, rand = Math.random) => {
  if (board.lost || board.won) return true;
  if (!board.placed) placeMines(board, index, rand);
  const start = board.cells[index];
  if (start.open || start.flag) return true;
  if (start.mine) {
    start.open = true;
    board.lost = true;
    board.cells.forEach((cell) => {
      if (cell.mine) cell.open = true;
    });
    return false;
  }
  const stack = [index];
  while (stack.length) {
    const i = stack.pop();
    const cell = board.cells[i];
    if (cell.open || cell.flag) continue;
    cell.open = true;
    if (cell.adjacent === 0) stack.push(...neighbours(board, i));
  }
  checkWin(board);
  return true;
};

export const toggleFlag = (board, index) => {
  const cell = board.cells[index];
  if (board.lost || board.won || cell.open) return;
  cell.flag = !cell.flag;
};

// Clicking an open number whose flags are all placed opens the rest of its neighbours.
export const chord = (board, index, rand = Math.random) => {
  const cell = board.cells[index];
  if (!cell.open || cell.adjacent === 0) return true;
  const around = neighbours(board, index);
  const flags = around.filter((n) => board.cells[n].flag).length;
  if (flags !== cell.adjacent) return true;
  return around.every((n) => reveal(board, n, rand));
};

export const minesLeft = (board) => board.mines - board.cells.filter((cell) => cell.flag).length;

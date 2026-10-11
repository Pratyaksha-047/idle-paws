import { SIZE, WIN_TILE, addRandomTile, canMove, maxTile, move, newGame } from './engine.js';

const STORAGE_KEY = 'claude-pets:2048';
const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down',
  h: 'left', l: 'right', k: 'up', j: 'down',
};
const SWIPE_MIN = 30;

const $ = (id) => document.getElementById(id);
const board = $('board');

// Inside the Claude Pets floating panel the native side handles closing.
const nativeBridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge;
const embedded = new URLSearchParams(location.search).has('embed') && Boolean(nativeBridge);
const closePanel = () => nativeBridge.postMessage({ type: 'closeGame' });
if (embedded) {
  document.body.classList.add('embed');
  $('close').classList.remove('hidden');
  $('close').addEventListener('click', closePanel);
}

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

const saved = load();
let state = {
  grid: saved.grid || newGame(),
  score: saved.score || 0,
  best: saved.best || 0,
  won: saved.won || false,
  keepGoing: saved.keepGoing || false,
};
let previous = null;
let spawned = null;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

const cells = [];
for (let i = 0; i < SIZE * SIZE; i++) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  board.insertBefore(cell, $('overlay'));
  cells.push(cell);
}

const render = () => {
  state.grid.forEach((row, r) =>
    row.forEach((value, c) => {
      const cell = cells[r * SIZE + c];
      cell.textContent = value || '';
      cell.dataset.v = value > WIN_TILE ? 'super' : String(value);
      cell.classList.toggle('spawn', Boolean(spawned && spawned[0] === r && spawned[1] === c));
    }),
  );
  $('score').textContent = state.score;
  $('best').textContent = state.best;
  $('undo').disabled = !previous;

  const lost = !canMove(state.grid);
  const wonNow = state.won && !state.keepGoing;
  $('overlay').classList.toggle('hidden', !lost && !wonNow);
  $('overlay-text').textContent = wonNow ? 'You made 2048! 🎉' : 'No moves left.';
  $('keep-going').classList.toggle('hidden', !wonNow);
};

const play = (dir) => {
  if (state.won && !state.keepGoing) return;
  const result = move(state.grid, dir);
  if (!result.moved) return;
  previous = { ...state, grid: state.grid };
  const next = addRandomTile(result.grid);
  spawned = next.cell;
  state.grid = next.grid;
  state.score += result.score;
  state.best = Math.max(state.best, state.score);
  if (!state.won && maxTile(state.grid) >= WIN_TILE) state.won = true;
  save();
  render();
};

const restart = () => {
  previous = null;
  spawned = null;
  state = { grid: newGame(), score: 0, best: state.best, won: false, keepGoing: false };
  save();
  render();
  board.focus();
};

const undo = () => {
  if (!previous) return;
  state = { ...previous, best: state.best };
  previous = null;
  spawned = null;
  save();
  render();
};

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Escape' && embedded) {
    closePanel();
    return;
  }
  const dir = KEYS[event.key] || KEYS[event.key.toLowerCase()];
  if (dir) {
    event.preventDefault();
    play(dir);
  } else if (event.key.toLowerCase() === 'n') {
    restart();
  } else if (event.key.toLowerCase() === 'u') {
    undo();
  }
});

let touchStart = null;
board.addEventListener('pointerdown', (event) => {
  touchStart = { x: event.clientX, y: event.clientY };
});
window.addEventListener('pointerup', (event) => {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});

$('new').addEventListener('click', restart);
$('try-again').addEventListener('click', restart);
$('undo').addEventListener('click', undo);
$('keep-going').addEventListener('click', () => {
  state.keepGoing = true;
  save();
  render();
});

render();
board.focus();

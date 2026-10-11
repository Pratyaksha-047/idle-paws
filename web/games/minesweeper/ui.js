import { chord, createBoard, minesLeft, reveal, toggleFlag } from './engine.js';

const STORAGE_KEY = 'claude-pets:minesweeper';
const LONG_PRESS_MS = 400;
const $ = (id) => document.getElementById(id);
const boardEl = $('board');

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
})();
const best = saved.best || {};

let board = null;
let cells = [];
let flagMode = false;
let startedAt = 0;
let elapsed = 0;
let timer = null;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: board.level, best }));

const stopTimer = () => {
  clearInterval(timer);
  timer = null;
};

const startTimer = () => {
  startedAt = Date.now();
  timer = setInterval(() => {
    elapsed = Math.floor((Date.now() - startedAt) / 1000);
    $('time').textContent = elapsed;
  }, 250);
};

const render = () => {
  board.cells.forEach((cell, i) => {
    const el = cells[i];
    el.className = 'cell';
    el.textContent = '';
    delete el.dataset.n;
    if (cell.open) {
      el.classList.add('open');
      if (cell.mine) {
        el.textContent = '💣';
        if (board.lost) el.classList.add('boom');
      } else if (cell.adjacent) {
        el.textContent = cell.adjacent;
        el.dataset.n = cell.adjacent;
      }
    } else if (cell.flag) {
      el.textContent = '🚩';
    }
  });
  $('left').textContent = minesLeft(board);
  $('best').textContent = best[board.level] != null ? best[board.level] : '–';
  const over = board.won || board.lost;
  $('overlay').classList.toggle('hidden', !over);
  $('overlay-text').textContent = board.won ? `Cleared in ${elapsed}s! 🎉` : '💥 Boom.';
  $('flag-mode').classList.toggle('on', flagMode);
};

const finish = () => {
  if (!board.won && !board.lost) return;
  stopTimer();
  if (board.won && (best[board.level] == null || elapsed < best[board.level])) {
    best[board.level] = elapsed;
    save();
  }
};

const act = (i, flag) => {
  if (board.won || board.lost) return;
  if (flag) {
    toggleFlag(board, i);
  } else {
    if (!board.placed) startTimer();
    if (board.cells[i].open) chord(board, i);
    else reveal(board, i);
    finish();
  }
  render();
};

const newGame = () => {
  stopTimer();
  elapsed = 0;
  $('time').textContent = '0';
  board = createBoard($('level').value);
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${board.cols}, 1fr)`;
  boardEl.style.setProperty('--cell-font', `${Math.max(11, Math.min(18, 260 / board.cols))}px`);
  cells = board.cells.map((_, i) => {
    const el = document.createElement('div');
    let pressTimer = null;
    let longPressed = false;
    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      longPressed = false;
      pressTimer = setTimeout(() => {
        longPressed = true;
        act(i, true);
      }, LONG_PRESS_MS);
    });
    el.addEventListener('pointerup', (event) => {
      if (event.button !== 0) return;
      clearTimeout(pressTimer);
      if (!longPressed) act(i, flagMode);
    });
    el.addEventListener('pointerleave', () => clearTimeout(pressTimer));
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      act(i, true);
    });
    boardEl.appendChild(el);
    return el;
  });
  save();
  render();
};

$('level').value = saved.level || 'easy';
$('level').addEventListener('change', newGame);
$('new').addEventListener('click', newGame);
$('again').addEventListener('click', newGame);
$('flag-mode').addEventListener('click', () => {
  flagMode = !flagMode;
  render();
});
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.tagName === 'SELECT') return;
  if (event.key.toLowerCase() === 'n') newGame();
  if (event.key.toLowerCase() === 'f') {
    flagMode = !flagMode;
    render();
  }
});

newGame();

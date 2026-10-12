import { pauseOnBlur } from '../pause.js';
import {
  COLS, ROWS, SHAPES, cellsOf, dropMs, ghostY, hardDrop, move, newGame, next, rotate, softDrop, tick,
} from './engine.js';

const STORAGE_KEY = 'claude-pets:tetris';
const COLORS = { I: '#5fb7d4', O: '#e6c34f', T: '#a984e0', S: '#7fb069', Z: '#e0574a', J: '#6b8fe0', L: '#d97757' };
const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const nextCanvas = $('next');
const nextCtx = nextCanvas.getContext('2d');

let best = Number(localStorage.getItem(STORAGE_KEY)) || 0;
let state = newGame();
let running = false;
let timer = null;
let cell = 20;

// Fits the board to the pane: limited by width (beside the stats column) and by height.
const resize = () => {
  const main = document.querySelector('main');
  const sideWidth = 84;
  const byWidth = Math.floor((main.clientWidth - sideWidth - 10) / COLS);
  const top = canvas.getBoundingClientRect().top + window.scrollY;
  const below = 110;
  const byHeight = Math.floor((window.innerHeight - top - below) / ROWS);
  cell = Math.max(12, Math.min(byWidth, byHeight, 30));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cell * COLS}px`;
  canvas.style.height = `${cell * ROWS}px`;
  canvas.width = cell * COLS * dpr;
  canvas.height = cell * ROWS * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  nextCanvas.width = nextCanvas.clientWidth * dpr;
  nextCanvas.height = nextCanvas.clientHeight * dpr;
  nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
};

const block = (context, x, y, size, color, alpha = 1) => {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, Math.max(2, size * 0.15));
  context.globalAlpha = 1;
};

const draw = () => {
  ctx.clearRect(0, 0, COLS * cell, ROWS * cell);
  ctx.strokeStyle = '#2f2e2b';
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, ROWS * cell);
    ctx.stroke();
  }
  state.board.forEach((row, y) => row.forEach((type, x) => type && block(ctx, x, y, cell, COLORS[type])));
  if (!state.over) {
    const ghost = { ...state.piece, y: ghostY(state) };
    cellsOf(ghost).forEach(([x, y]) => y >= 0 && block(ctx, x, y, cell, COLORS[state.piece.type], 0.2));
    cellsOf(state.piece).forEach(([x, y]) => y >= 0 && block(ctx, x, y, cell, COLORS[state.piece.type]));
  }
  drawNext();
  $('score').textContent = state.score;
  $('lines').textContent = state.lines;
  $('level').textContent = state.level;
  $('best').textContent = best;
};

const drawNext = () => {
  const type = next(state);
  const matrix = SHAPES[type];
  const w = nextCanvas.clientWidth;
  const h = nextCanvas.clientHeight;
  const size = Math.floor(Math.min(w / 4.5, h / 3));
  nextCtx.clearRect(0, 0, w, h);
  const rows = matrix.filter((row) => row.some(Boolean));
  const width = matrix[0].length;
  const ox = (w - width * size) / 2 / size;
  const oy = (h - rows.length * size) / 2 / size;
  rows.forEach((row, r) => row.forEach((v, c) => v && block(nextCtx, ox + c, oy + r, size, COLORS[type])));
};

const showOverlay = (text, button) => {
  $('overlay-text').textContent = text;
  $('start').textContent = button;
  $('overlay').classList.remove('hidden');
};

const afterAction = () => {
  if (state.score > best) {
    best = state.score;
    localStorage.setItem(STORAGE_KEY, String(best));
  }
  draw();
  if (state.over) {
    running = false;
    clearTimeout(timer);
    showOverlay(`Game over · ${state.score}`, 'Play again');
  }
};

const loop = () => {
  tick(state);
  afterAction();
  if (running) timer = setTimeout(loop, dropMs(state.level));
};

const start = () => {
  if (running) return;
  if (state.over) state = newGame();
  running = true;
  $('overlay').classList.add('hidden');
  draw();
  timer = setTimeout(loop, dropMs(state.level));
};

const pause = () => {
  if (!running) return;
  running = false;
  clearTimeout(timer);
  showOverlay('Paused', 'Resume');
};

const restart = () => {
  clearTimeout(timer);
  running = false;
  state = newGame();
  draw();
  start();
};

const ACTIONS = {
  left: () => move(state, -1),
  right: () => move(state, 1),
  rotate: () => rotate(state, 1),
  rotateBack: () => rotate(state, -1),
  soft: () => softDrop(state),
  hard: () => hardDrop(state),
};

const perform = (name) => {
  if (!running) return;
  ACTIONS[name]();
  afterAction();
};

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'soft', ' ': 'hard',
  x: 'rotate', z: 'rotateBack', a: 'left', d: 'right', w: 'rotate', s: 'soft',
};

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === 'p') {
    if (running) pause();
    else start();
    return;
  }
  if (key === 'n') return restart();
  const action = KEYS[key];
  if (!action) return;
  event.preventDefault();
  if (!running) return start();
  perform(action);
});

document.querySelectorAll('.controls button').forEach((button) => {
  button.addEventListener('click', () => perform(button.dataset.act));
});
pauseOnBlur(pause);
$('start').addEventListener('click', start);
$('new').addEventListener('click', restart);
window.addEventListener('resize', resize);

resize();

import { pauseOnBlur } from '../pause.js';
import { newGame, step, tickMs, turn } from './engine.js';

const STORAGE_KEY = 'claude-pets:snake';
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
const SWIPE_MIN = 24;
const COLORS = { grid: '#2f2e2b', head: '#f09a74', body: '#d97757', food: '#e0483e', leaf: '#7fb069' };

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');

let best = Number(localStorage.getItem(STORAGE_KEY)) || 0;
let state = newGame();
let running = false;
let timer = null;

const resize = () => {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  draw();
};

const draw = () => {
  const cell = canvas.width / state.cols;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.grid;
  for (let y = 0; y < state.rows; y++) {
    for (let x = (y % 2); x < state.cols; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  if (state.food) {
    const [fx, fy] = state.food;
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc((fx + 0.5) * cell, (fy + 0.55) * cell, cell * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.leaf;
    ctx.fillRect((fx + 0.5) * cell, (fy + 0.08) * cell, cell * 0.22, cell * 0.16);
  }
  const inset = cell * 0.08;
  state.snake.forEach(([x, y], i) => {
    ctx.fillStyle = i === 0 ? COLORS.head : COLORS.body;
    ctx.beginPath();
    ctx.roundRect(x * cell + inset, y * cell + inset, cell - 2 * inset, cell - 2 * inset, cell * 0.25);
    ctx.fill();
  });
  const [hx, hy] = state.snake[0];
  ctx.fillStyle = '#1f1e1d';
  const eye = cell * 0.1;
  const offsets = { up: [[0.3, 0.3], [0.7, 0.3]], down: [[0.3, 0.7], [0.7, 0.7]], left: [[0.3, 0.3], [0.3, 0.7]], right: [[0.7, 0.3], [0.7, 0.7]] };
  offsets[state.dir].forEach(([ox, oy]) => {
    ctx.beginPath();
    ctx.arc((hx + ox) * cell, (hy + oy) * cell, eye, 0, Math.PI * 2);
    ctx.fill();
  });
};

const showOverlay = (text, button) => {
  $('overlay-text').textContent = text;
  $('start').textContent = button;
  $('overlay').classList.remove('hidden');
};

const loop = () => {
  step(state);
  $('score').textContent = state.score;
  if (state.score > best) {
    best = state.score;
    localStorage.setItem(STORAGE_KEY, String(best));
    $('best').textContent = best;
  }
  draw();
  if (!state.alive || state.won) {
    running = false;
    showOverlay(state.won ? 'You filled the board! 🎉' : `Game over · ${state.score}`, 'Play again');
    return;
  }
  timer = setTimeout(loop, tickMs(state.score));
};

const start = () => {
  if (running) return;
  if (!state.alive || state.won) reset();
  running = true;
  $('overlay').classList.add('hidden');
  timer = setTimeout(loop, tickMs(state.score));
};

const pause = () => {
  if (!running) return;
  running = false;
  clearTimeout(timer);
  showOverlay('Paused', 'Resume');
};

const reset = () => {
  clearTimeout(timer);
  running = false;
  state = newGame();
  $('score').textContent = '0';
  draw();
};

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const dir = KEYS[event.key] || KEYS[event.key.toLowerCase()];
  if (dir) {
    event.preventDefault();
    turn(state, dir);
    start();
  } else if (event.key === ' ') {
    event.preventDefault();
    if (running) pause();
    else start();
  } else if (event.key.toLowerCase() === 'n') {
    reset();
    showOverlay('Press an arrow key to start', 'Start');
  }
});

let touchStart = null;
canvas.addEventListener('pointerdown', (event) => {
  touchStart = { x: event.clientX, y: event.clientY };
});
window.addEventListener('pointerup', (event) => {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  turn(state, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  start();
});

pauseOnBlur(pause);
$('start').addEventListener('click', start);
$('new').addEventListener('click', () => {
  reset();
  showOverlay('Press an arrow key to start', 'Start');
});
window.addEventListener('resize', resize);

$('best').textContent = best;
resize();

import { CELLS, PEERS, conflicts, generate, isSolved } from './engine.js';

const STORAGE_KEY = 'claude-pets:sudoku';
const $ = (id) => document.getElementById(id);
const gridEl = $('grid');

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

const fresh = (difficulty) => {
  const { puzzle, solution } = generate(difficulty);
  return { difficulty, puzzle, solution, grid: puzzle.slice(), mistakes: 0, elapsed: 0, solved: false };
};

let state = load() || fresh('easy');
let selected = state.grid.findIndex((v) => v === 0);
let startedAt = Date.now() - state.elapsed * 1000;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

const cells = Array.from({ length: CELLS }, (_, i) => {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.addEventListener('mousedown', () => select(i));
  gridEl.appendChild(cell);
  return cell;
});

const padButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((v) => {
  const button = document.createElement('button');
  button.textContent = v === 0 ? '⌫' : String(v);
  button.title = v === 0 ? 'Erase (Backspace)' : `Place ${v}`;
  button.addEventListener('click', () => place(v));
  $('pad').appendChild(button);
  return button;
});

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const render = () => {
  const clash = conflicts(state.grid);
  const value = selected >= 0 ? state.grid[selected] : 0;
  const peers = selected >= 0 ? new Set(PEERS[selected]) : new Set();
  cells.forEach((cell, i) => {
    const v = state.grid[i];
    cell.textContent = v || '';
    cell.className = 'cell';
    if (state.puzzle[i]) cell.classList.add('given');
    if (peers.has(i)) cell.classList.add('peer');
    if (value && v === value) cell.classList.add('same');
    if (i === selected) cell.classList.add('selected');
    if (clash.has(i)) cell.classList.add('conflict');
  });
  padButtons.forEach((button, k) => {
    const v = k + 1;
    button.classList.toggle('done', v <= 9 && state.grid.filter((x) => x === v).length >= 9);
  });
  $('mistakes').textContent = state.mistakes;
  $('difficulty').value = state.difficulty;
  $('overlay').classList.toggle('hidden', !state.solved);
};

const select = (i) => {
  selected = i;
  render();
};

const place = (v) => {
  if (state.solved || selected < 0 || state.puzzle[selected]) return;
  if (v !== 0 && v !== state.solution[selected] && state.grid[selected] !== v) state.mistakes++;
  state.grid[selected] = v;
  if (isSolved(state.grid, state.solution)) state.solved = true;
  save();
  render();
};

const newGame = () => {
  state = fresh($('difficulty').value);
  selected = state.grid.findIndex((v) => v === 0);
  startedAt = Date.now();
  save();
  render();
  gridEl.focus();
};

const moveSelection = (dr, dc) => {
  const current = selected < 0 ? 0 : selected;
  const row = (Math.floor(current / 9) + dr + 9) % 9;
  const col = ((current % 9) + dc + 9) % 9;
  select(row * 9 + col);
};

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.tagName === 'SELECT') return;
  const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (arrows[event.key]) {
    event.preventDefault();
    moveSelection(...arrows[event.key]);
  } else if (/^[1-9]$/.test(event.key)) {
    place(Number(event.key));
  } else if (['Backspace', 'Delete', '0'].includes(event.key)) {
    place(0);
  } else if (event.key.toLowerCase() === 'n') {
    newGame();
  }
});

setInterval(() => {
  if (state.solved || document.hidden) {
    startedAt = Date.now() - state.elapsed * 1000;
    return;
  }
  state.elapsed = Math.floor((Date.now() - startedAt) / 1000);
  $('time').textContent = formatTime(state.elapsed);
  save();
}, 1000);

$('new').addEventListener('click', newGame);
$('again').addEventListener('click', newGame);
$('difficulty').addEventListener('change', newGame);

$('time').textContent = formatTime(state.elapsed);
render();
gridEl.focus();

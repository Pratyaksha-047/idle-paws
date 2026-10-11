import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LEVELS, chord, createBoard, minesLeft, neighbours, placeMines, reveal, toggleFlag,
} from '../web/games/minesweeper/engine.js';

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// Builds a board with mines exactly at the given indices.
const boardWith = (level, mines) => {
  const board = createBoard(level);
  mines.forEach((i) => {
    board.cells[i].mine = true;
  });
  board.cells.forEach((cell, i) => {
    cell.adjacent = neighbours(board, i).filter((n) => board.cells[n].mine).length;
  });
  board.mines = mines.length;
  board.placed = true;
  return board;
};

test('neighbours handles corners, edges and centre', () => {
  const board = createBoard('easy');
  assert.equal(neighbours(board, 0).length, 3);
  assert.equal(neighbours(board, 4).length, 5);
  assert.equal(neighbours(board, 40).length, 8);
});

test('first reveal is always safe and opens an area', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const board = createBoard('hard');
    assert.equal(reveal(board, 100, seeded(seed)), true);
    assert.equal(board.cells.filter((c) => c.mine).length, LEVELS.hard.mines);
    assert.ok(board.cells[100].open && board.cells[100].adjacent === 0);
  }
});

test('placeMines never mines the first cell or its neighbours', () => {
  const board = createBoard('easy');
  placeMines(board, 40, seeded(3));
  [40, ...neighbours(board, 40)].forEach((i) => assert.equal(board.cells[i].mine, false));
});

test('revealing a mine loses and exposes all mines', () => {
  const board = boardWith('easy', [0, 80]);
  assert.equal(reveal(board, 0), false);
  assert.equal(board.lost, true);
  assert.ok(board.cells[80].open);
});

test('flood fill stops at numbers and win is detected', () => {
  const board = boardWith('easy', [0]);
  reveal(board, 80);
  assert.equal(board.won, true);
  assert.equal(board.cells[0].open, false);
  assert.equal(board.cells[0].flag, true);
});

test('flags block reveal and count down mines left', () => {
  const board = boardWith('easy', [0, 1]);
  toggleFlag(board, 40);
  assert.equal(minesLeft(board), 1);
  reveal(board, 40);
  assert.equal(board.cells[40].open, false);
  toggleFlag(board, 40);
  assert.equal(minesLeft(board), 2);
});

test('chord opens neighbours when flags match the number', () => {
  const board = boardWith('easy', [0]);
  reveal(board, 10); // touches mine at 0 -> shows 1
  assert.equal(board.cells[10].adjacent, 1);
  toggleFlag(board, 0);
  assert.equal(chord(board, 10), true);
  assert.ok(board.cells[1].open && board.cells[9].open);
});

test('chord with a wrong flag hits the mine', () => {
  const board = boardWith('easy', [0]);
  reveal(board, 10);
  toggleFlag(board, 1);
  assert.equal(chord(board, 10), false);
  assert.equal(board.lost, true);
});

test('createBoard rejects unknown levels', () => {
  assert.throws(() => createBoard('nightmare'), /unknown level/);
});

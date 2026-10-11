import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COLS, ROWS, SHAPES, cellsOf, collides, dropMs, ghostY, hardDrop, move, newGame, next, rotate, rotateMatrix, tick,
} from '../web/games/tetris/engine.js';

const fixed = (value) => () => value;

test('rotateMatrix clockwise then counter-clockwise is identity', () => {
  for (const shape of Object.values(SHAPES)) {
    assert.deepEqual(rotateMatrix(rotateMatrix(shape, 1), -1), shape);
    assert.deepEqual(rotateMatrix(rotateMatrix(rotateMatrix(rotateMatrix(shape)))), shape);
  }
});

test('7-bag deals every piece once per bag', () => {
  const state = newGame(Math.random);
  const seen = [state.piece.type, ...state.queue.slice(0, 6)];
  assert.deepEqual([...seen].sort(), Object.keys(SHAPES).sort());
});

test('move respects walls', () => {
  const state = newGame(fixed(0));
  for (let i = 0; i < COLS; i++) move(state, -1);
  assert.equal(Math.min(...cellsOf(state.piece).map(([x]) => x)), 0);
  assert.equal(move(state, -1), false);
});

test('rotate kicks off the wall instead of failing', () => {
  const state = newGame(fixed(0));
  state.piece = { type: 'I', matrix: rotateMatrix(SHAPES.I), x: -2, y: 5 };
  assert.equal(collides(state.board, state.piece), false);
  assert.equal(rotate(state), true);
  assert.ok(cellsOf(state.piece).every(([x]) => x >= 0 && x < COLS));
});

test('hard drop lands on the floor and scores 2 per row', () => {
  const state = newGame(fixed(0));
  state.piece = { type: 'O', matrix: SHAPES.O, x: 0, y: 0 };
  const landing = ghostY(state);
  assert.equal(landing, ROWS - 2);
  hardDrop(state, fixed(0));
  assert.equal(state.board[ROWS - 1][0], 'O');
  assert.equal(state.score, landing * 2);
});

test('clearing a line scores and drops rows', () => {
  const state = newGame(fixed(0));
  for (let x = 0; x < COLS - 1; x++) state.board[ROWS - 1][x] = 'J';
  state.board[ROWS - 2][0] = 'L';
  state.piece = { type: 'I', matrix: rotateMatrix(SHAPES.I), x: COLS - 3, y: 0 };
  const before = state.score;
  const cleared = hardDrop(state, fixed(0));
  assert.equal(cleared, 1);
  assert.equal(state.lines, 1);
  assert.equal(state.board[ROWS - 1][0], 'L');
  assert.ok(state.score - before >= 100);
});

test('tick moves down, then locks and spawns the next piece', () => {
  const state = newGame(fixed(0));
  const upcoming = next(state);
  state.piece = { type: 'O', matrix: SHAPES.O, x: 4, y: ROWS - 2 };
  assert.equal(tick(state, fixed(0)), 0);
  assert.equal(state.board[ROWS - 1][4], 'O');
  assert.equal(state.piece.type, upcoming);
});

test('stacking to the top ends the game', () => {
  const state = newGame(fixed(0));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) state.board[y][x] = 'Z';
  for (let i = 0; i < 5 && !state.over; i++) hardDrop(state, fixed(0));
  assert.equal(state.over, true);
});

test('dropMs speeds up with level and is capped', () => {
  assert.equal(dropMs(1), 800);
  assert.ok(dropMs(5) < dropMs(1));
  assert.equal(dropMs(100), 80);
});

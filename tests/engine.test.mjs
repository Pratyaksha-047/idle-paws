import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addRandomTile, canMove, emptyCells, emptyGrid, maxTile, move, newGame, slideLine,
} from '../web/games/2048/engine.js';

test('slideLine compacts and merges toward the start', () => {
  assert.deepEqual(slideLine([0, 2, 0, 2]), { line: [4, 0, 0, 0], score: 4, moved: true });
  assert.deepEqual(slideLine([2, 4, 8, 16]), { line: [2, 4, 8, 16], score: 0, moved: false });
});

test('slideLine merges each tile at most once', () => {
  assert.deepEqual(slideLine([2, 2, 2, 2]).line, [4, 4, 0, 0]);
  assert.deepEqual(slideLine([4, 4, 8, 0]).line, [8, 8, 0, 0]);
  assert.deepEqual(slideLine([2, 2, 2, 0]).line, [4, 2, 0, 0]);
});

test('move handles all four directions', () => {
  const grid = [
    [2, 0, 0, 2],
    [0, 4, 0, 4],
    [0, 0, 0, 0],
    [2, 0, 0, 0],
  ];
  assert.deepEqual(move(grid, 'left').grid[0], [4, 0, 0, 0]);
  assert.deepEqual(move(grid, 'right').grid[1], [0, 0, 0, 8]);
  assert.deepEqual(move(grid, 'up').grid.map((r) => r[0]), [4, 0, 0, 0]);
  assert.deepEqual(move(grid, 'down').grid.map((r) => r[3]), [0, 0, 2, 4]);
  assert.equal(move(grid, 'left').score, 12);
});

test('move reports no-op moves and does not mutate input', () => {
  const grid = [
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const snapshot = JSON.stringify(grid);
  assert.equal(move(grid, 'left').moved, false);
  assert.equal(move(grid, 'right').moved, true);
  assert.equal(JSON.stringify(grid), snapshot);
});

test('move rejects unknown directions', () => {
  assert.throws(() => move(emptyGrid(), 'sideways'), /unknown direction/);
});

test('addRandomTile fills an empty cell with 2 or 4', () => {
  const sequence = [0, 0.95];
  const { grid, cell } = addRandomTile(emptyGrid(), () => sequence.shift());
  assert.deepEqual(cell, [0, 0]);
  assert.equal(grid[0][0], 4);
  assert.equal(emptyCells(grid).length, 15);
});

test('addRandomTile on a full board is a no-op', () => {
  const full = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert.deepEqual(addRandomTile(full), { grid: full, cell: null });
});

test('canMove detects stuck boards', () => {
  const stuck = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert.equal(canMove(stuck), false);
  const mergeable = [[2, 2, 4, 8], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]];
  assert.equal(canMove(mergeable), true);
});

test('newGame starts with two tiles', () => {
  const grid = newGame();
  assert.equal(emptyCells(grid).length, 14);
  assert.ok(maxTile(grid) <= 4);
});

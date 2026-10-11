import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CELLS, DIFFICULTY, PEERS, conflicts, countSolutions, generate, generateSolved, isSolved, solve,
} from '../web/games/sudoku/engine.js';

// Deterministic PRNG (mulberry32) so failures reproduce.
const seeded = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('every cell has 20 peers', () => {
  assert.ok(PEERS.every((p) => p.length === 20));
});

test('generateSolved produces a valid full grid', () => {
  const grid = generateSolved(seeded(1));
  assert.equal(grid.length, CELLS);
  assert.ok(grid.every((v) => v >= 1 && v <= 9));
  assert.equal(conflicts(grid).size, 0);
});

test('generate yields a unique-solution puzzle matching its solution', () => {
  for (const difficulty of Object.keys(DIFFICULTY)) {
    const { puzzle, solution } = generate(difficulty, seeded(7));
    const clues = puzzle.filter((v) => v !== 0).length;
    assert.ok(clues >= DIFFICULTY[difficulty], `${difficulty}: ${clues} clues`);
    assert.ok(clues < CELLS);
    assert.equal(countSolutions(puzzle, 2), 1);
    assert.deepEqual(solve(puzzle), solution);
    puzzle.forEach((v, i) => v && assert.equal(v, solution[i]));
  }
});

test('generate rejects unknown difficulty', () => {
  assert.throws(() => generate('impossible'), /unknown difficulty/);
});

test('conflicts flags clashing digits in a row, column and box', () => {
  const grid = Array(CELLS).fill(0);
  grid[0] = 5;
  grid[8] = 5; // same row
  grid[80] = 3;
  assert.deepEqual([...conflicts(grid)].sort((a, b) => a - b), [0, 8]);
  grid[8] = 0;
  grid[10] = 5; // same box
  assert.deepEqual([...conflicts(grid)].sort((a, b) => a - b), [0, 10]);
});

test('countSolutions sees multiple solutions on an empty grid', () => {
  assert.equal(countSolutions(Array(CELLS).fill(0), 2), 2);
});

test('isSolved compares against the solution', () => {
  const solution = generateSolved(seeded(3));
  assert.equal(isSolved(solution.slice(), solution), true);
  const wrong = solution.slice();
  wrong[0] = 0;
  assert.equal(isSolved(wrong, solution), false);
});

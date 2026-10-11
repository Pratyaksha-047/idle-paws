import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newGame, placeFood, step, tickMs, turn } from '../web/games/snake/engine.js';

const fixed = (value) => () => value;

test('newGame places a 3-long snake and food off the snake', () => {
  const state = newGame(17, 17, fixed(0));
  assert.equal(state.snake.length, 3);
  assert.ok(!state.snake.some(([x, y]) => x === state.food[0] && y === state.food[1]));
});

test('step moves the head and keeps length when not eating', () => {
  const state = newGame(17, 17, fixed(0));
  state.food = [0, 0];
  const [hx, hy] = state.snake[0];
  step(state);
  assert.deepEqual(state.snake[0], [hx + 1, hy]);
  assert.equal(state.snake.length, 3);
});

test('eating grows the snake and scores', () => {
  const state = newGame(17, 17, fixed(0));
  const [hx, hy] = state.snake[0];
  state.food = [hx + 1, hy];
  step(state, fixed(0));
  assert.equal(state.snake.length, 4);
  assert.equal(state.score, 1);
  assert.notDeepEqual(state.food, [hx + 1, hy]);
});

test('turn ignores reversal and applies one queued turn per step', () => {
  const state = newGame();
  turn(state, 'left');
  assert.deepEqual(state.queue, []);
  turn(state, 'up');
  turn(state, 'left');
  assert.deepEqual(state.queue, ['up', 'left']);
  step(state);
  assert.equal(state.dir, 'up');
  step(state);
  assert.equal(state.dir, 'left');
});

test('hitting a wall ends the game', () => {
  const state = newGame(5, 5, fixed(0));
  state.food = null;
  for (let i = 0; i < 10 && state.alive; i++) step(state);
  assert.equal(state.alive, false);
});

test('running into the body ends the game', () => {
  const state = newGame(17, 17, fixed(0));
  state.snake = [[5, 5], [4, 5], [4, 6], [5, 6], [6, 6]];
  state.dir = 'right';
  state.food = [0, 0];
  turn(state, 'down');
  step(state);
  assert.equal(state.alive, false);
});

test('moving into the tail cell is allowed (tail moves away)', () => {
  const state = newGame(17, 17, fixed(0));
  state.snake = [[5, 5], [5, 6], [6, 6], [6, 5]];
  state.dir = 'up';
  state.food = [0, 0];
  turn(state, 'right');
  step(state);
  assert.equal(state.alive, true);
});

test('placeFood returns null on a full board', () => {
  const state = { cols: 2, rows: 1, snake: [[0, 0], [1, 0]] };
  assert.equal(placeFood(state), null);
});

test('tickMs speeds up and is capped', () => {
  assert.ok(tickMs(0) > tickMs(10));
  assert.equal(tickMs(1000), 65);
});

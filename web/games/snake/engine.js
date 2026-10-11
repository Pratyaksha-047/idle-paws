// Snake logic on a cols x rows grid. The snake is a list of [x, y], head first.
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const key = ([x, y]) => `${x},${y}`;

export const placeFood = (state, rand = Math.random) => {
  const taken = new Set(state.snake.map(key));
  const free = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (!taken.has(`${x},${y}`)) free.push([x, y]);
    }
  }
  return free.length ? free[Math.floor(rand() * free.length)] : null;
};

export const newGame = (cols = 17, rows = 17, rand = Math.random) => {
  const y = Math.floor(rows / 2);
  const x = Math.floor(cols / 4) + 2;
  const state = {
    cols,
    rows,
    snake: [[x, y], [x - 1, y], [x - 2, y]],
    dir: 'right',
    queue: [],
    food: null,
    score: 0,
    alive: true,
    won: false,
  };
  state.food = placeFood(state, rand);
  return state;
};

// Queues a turn; ignores reversals and repeats relative to the last queued direction.
export const turn = (state, dir) => {
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (!DIRS[dir] || dir === last || dir === OPPOSITE[last] || state.queue.length >= 3) return;
  state.queue.push(dir);
};

// Advances one tick. Walls and the snake's own body are fatal.
export const step = (state, rand = Math.random) => {
  if (!state.alive || state.won) return state;
  if (state.queue.length) state.dir = state.queue.shift();
  const [dx, dy] = DIRS[state.dir];
  const [hx, hy] = state.snake[0];
  const head = [hx + dx, hy + dy];
  const eating = state.food && head[0] === state.food[0] && head[1] === state.food[1];
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const outside = head[0] < 0 || head[1] < 0 || head[0] >= state.cols || head[1] >= state.rows;
  if (outside || body.some((p) => p[0] === head[0] && p[1] === head[1])) {
    state.alive = false;
    return state;
  }
  state.snake = [head, ...body];
  if (eating) {
    state.score += 1;
    state.food = placeFood(state, rand);
    if (!state.food) state.won = true;
  }
  return state;
};

// Milliseconds per tick: starts relaxed, speeds up with score, capped.
export const tickMs = (score) => Math.max(65, 150 - score * 4);

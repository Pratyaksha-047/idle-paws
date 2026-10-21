import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { parseGames } = createRequire(import.meta.url)('../server/games.js');

test('plain links get the host as name', () => {
  assert.deepEqual(parseGames(['https://www.lichess.org/training']), [
    { name: 'lichess.org', url: 'https://www.lichess.org/training' },
  ]);
});

test('"Name | link" sets the name; scheme defaults to https', () => {
  assert.deepEqual(parseGames(['Murder sudoku | murdoku.com']), [{ name: 'Murder sudoku', url: 'https://murdoku.com/' }]);
});

test('one value may hold several entries', () => {
  const games = parseGames(['https://a.example, Bee | https://b.example\nhttps://c.example']);
  assert.deepEqual(games.map((g) => g.name), ['a.example', 'Bee', 'c.example']);
});

test('unfilled setting placeholder, blanks, bad links and duplicates are dropped', () => {
  const games = parseGames(['${user_config.games}', '', '   ', 'not a url at all', 'javascript:alert(1)', 'ftp://x.example', 'https://a.example', 'https://a.example']);
  assert.deepEqual(games, [{ name: 'a.example', url: 'https://a.example/' }]);
});

test('no values means no games', () => {
  assert.deepEqual(parseGames([]), []);
});

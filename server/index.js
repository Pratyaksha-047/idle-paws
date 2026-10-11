#!/usr/bin/env node
// Claude Pets MCP server (stdio). Launches ClaudePets.app and forwards tool calls to it
// over a unix socket. Holding the socket open keeps the overlay alive.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const readline = require('readline');

const VERSION = '0.1.0';
const ROOT = path.resolve(__dirname, '..');
const APP_PATH = process.env.CLAUDE_PETS_APP || path.join(ROOT, 'ClaudePets.app');
const APP_EXE = path.join(APP_PATH, 'Contents', 'MacOS', 'ClaudePets');
const SOCKET_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'claude-pets', 'pets.sock');
const CLIENT = process.env.CLAUDE_PETS_CLIENT || 'unknown';
const REQUEST_TIMEOUT_MS = 4000;
const GAMES = ['2048', 'sudoku', 'minesweeper', 'snake', 'tetris'];

const log = (...parts) => process.stderr.write(`[claude-pets:${CLIENT}] ${parts.join(' ')}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- overlay app link

let socket = null;
let connecting = null;
let buffer = '';
let nextId = 1;
const pending = new Map();

const CLAUDE_DESKTOP_EXE = /\/Claude\.app\/Contents\/MacOS\/Claude$/m;

const claudeDesktopRunning = () => CLAUDE_DESKTOP_EXE.test(String(spawnSync('ps', ['-axo', 'comm=']).stdout));

const prepareApp = () => {
  try {
    fs.chmodSync(APP_EXE, 0o755);
  } catch (err) {
    log('chmod failed:', err.message);
  }
  spawnSync('xattr', ['-dr', 'com.apple.quarantine', APP_PATH]);
};

const launchApp = () => {
  const result = spawnSync('open', ['-g', APP_PATH]);
  if (result.status !== 0) log('open failed:', String(result.stderr).trim());
};

const tryConnect = () =>
  new Promise((resolve) => {
    const s = net.createConnection(SOCKET_PATH);
    s.once('connect', () => resolve(s));
    s.once('error', () => resolve(null));
  });

const onAppMessage = (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  clearTimeout(waiter.timer);
  waiter.resolve(message);
};

const attach = (s) => {
  socket = s;
  buffer = '';
  s.setEncoding('utf8');
  s.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      onAppMessage(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  });
  s.on('close', () => {
    if (socket === s) socket = null;
    pending.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('overlay app disconnected'));
    });
    pending.clear();
  });
  s.on('error', () => {});
  s.write(`${JSON.stringify({ id: 0, cmd: 'hello', args: { client: CLIENT } })}\n`);
};

const connect = async ({ launch }) => {
  if (socket) return socket;
  if (connecting) return connecting;
  connecting = (async () => {
    let s = await tryConnect();
    if (!s && launch) {
      prepareApp();
      launchApp();
      for (let i = 0; i < 40 && !s; i++) {
        await sleep(250);
        s = await tryConnect();
      }
    }
    if (s) attach(s);
    return s;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
};

const request = async (cmd, args = {}) => {
  if (!claudeDesktopRunning()) throw new Error('Claude Desktop is not running; the pet lives on its window.');
  const s = await connect({ launch: true });
  if (!s) throw new Error('could not start the Claude Pets overlay (see ~/Library/Logs/claude-pets.log)');
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`overlay did not answer "${cmd}"`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    s.write(`${JSON.stringify({ id, cmd, args })}\n`);
  });
};

// Keep the overlay up while Claude Desktop runs (restarts it after a crash).
const keepAlive = async () => {
  if (!socket && claudeDesktopRunning()) await connect({ launch: true });
};

// ---------------------------------------------------------------- MCP

const emptySchema = { type: 'object', properties: {}, additionalProperties: false };

const TOOLS = [
  {
    name: 'open_game',
    description:
      'Open Claude Pets mini games for the user to play while Claude works. Returns a localhost URL; ' +
      'open it in the built-in browser pane (side panel). Without `game` it opens the games menu.',
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string', enum: GAMES, description: 'Open this game directly instead of the menu.' },
      },
      additionalProperties: false,
    },
  },
  { name: 'open_console', description: 'Open the Claude Pets console (pet controls and games) next to the pet.', inputSchema: emptySchema },
  { name: 'pet_show', description: 'Show the Claude Pets cat on the Claude window.', inputSchema: emptySchema },
  { name: 'pet_hide', description: 'Hide the Claude Pets cat (a paw print stays; double-click it to bring the cat back).', inputSchema: emptySchema },
  { name: 'pet_status', description: 'Report Claude Pets overlay status (pet visibility, floor detection, games URL).', inputSchema: emptySchema },
];

const text = (value, isError = false) => ({ content: [{ type: 'text', text: value }], ...(isError ? { isError: true } : {}) });

const callTool = async (name, args = {}) => {
  switch (name) {
    case 'open_game': {
      const { game } = args;
      if (game && !GAMES.includes(game)) return text(`Unknown game "${game}". Available: ${GAMES.join(', ')}.`, true);
      const res = await request('open_game', { game });
      return text(
        `${res.url}\nOpen this URL in the built-in browser pane (side panel) so the user can play. ` +
          'If no built-in browser is available, give the user the link.',
      );
    }
    case 'open_console':
      await request('console');
      return text('Console opened next to the pet.');
    case 'pet_show':
      await request('show');
      return text('Pet is visible.');
    case 'pet_hide':
      await request('hide');
      return text('Pet hidden; a paw print remains (double-click it to bring the pet back).');
    case 'pet_status': {
      const res = await request('status');
      delete res.id;
      return text(JSON.stringify(res, null, 2));
    }
    default:
      return text(`Unknown tool "${name}".`, true);
  }
};

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

const handle = async (message) => {
  const { id, method, params = {} } = message;
  const reply = (result) => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, msg) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message: msg } });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'claude-pets', version: VERSION },
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call':
      try {
        return reply(await callTool(params.name, params.arguments));
      } catch (err) {
        return reply(text(`Claude Pets: ${err.message}`, true));
      }
    default:
      if (method && method.startsWith('notifications/')) return undefined;
      return fail(-32601, `Method not found: ${method}`);
  }
};

const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  handle(message);
});
input.on('close', () => process.exit(0));

log(`starting v${VERSION}, app=${APP_PATH}`);
keepAlive();
setInterval(keepAlive, 10000).unref();

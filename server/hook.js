#!/usr/bin/env node
// Claude Code hook: tells the pet a session finished (Stop) or needs the user (Notification).
// Never blocks or fails Claude: one message, 1s budget, always exits 0.
'use strict';

const net = require('net');
const os = require('os');
const path = require('path');

const SOCKET_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'claude-pets', 'pets.sock');
const KINDS = { Stop: 'done', Notification: 'attention' };

const finish = () => process.exit(0);
setTimeout(finish, 1000).unref();

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    // Missing or bad input still gets a generic reaction.
  }
  const kind = KINDS[input.hook_event_name || process.argv[2]];
  if (!kind) return finish();
  const project = input.cwd ? path.basename(input.cwd) : '';
  const socket = net.createConnection(SOCKET_PATH);
  socket.on('error', finish);
  socket.on('connect', () => {
    socket.end(`${JSON.stringify({ id: 1, cmd: 'react', args: { kind, project } })}\n`);
  });
  socket.on('close', finish);
});

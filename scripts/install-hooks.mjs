#!/usr/bin/env node
// Adds Claude Code Stop + Notification hooks that make the pet react.
// Idempotent; backs up ~/.claude/settings.json; leaves other hooks untouched.
//   node scripts/install-hooks.mjs [path/to/hook.js]   (default: installed extension)
//   node scripts/install-hooks.mjs --remove
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const DEFAULT_HOOK = path.join(
  os.homedir(), 'Library', 'Application Support', 'Claude', 'Claude Extensions',
  'local.mcpb.pratyaksha-gupta.idle-paws', 'server', 'hook.js',
);
// Also matches hooks installed under the project's old name.
const MARKERS = ['idle-paws', 'claude-pets'];
const EVENTS = ['Stop', 'Notification'];

const remove = process.argv.includes('--remove');
const hookPath = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || DEFAULT_HOOK;
if (!remove && !fs.existsSync(hookPath)) {
  console.error(`hook script not found: ${hookPath}`);
  process.exit(1);
}

const settings = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : {};
fs.copyFileSync(SETTINGS, `${SETTINGS}.bak-idle-paws`);

const isOurs = (group) => (group.hooks || []).some((hook) => MARKERS.some((marker) => String(hook.command || '').includes(marker)));
settings.hooks = settings.hooks || {};
for (const event of EVENTS) {
  const groups = (settings.hooks[event] || []).filter((group) => !isOurs(group));
  if (!remove) {
    groups.push({ hooks: [{ type: 'command', command: `node "${hookPath}"`, timeout: 5 }] });
  }
  if (groups.length) settings.hooks[event] = groups;
  else delete settings.hooks[event];
}

fs.writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`${remove ? 'removed' : 'installed'} idle-paws hooks (${EVENTS.join(', ')}) in ${SETTINGS}`);

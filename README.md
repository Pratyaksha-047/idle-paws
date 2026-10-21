# Idle Paws

A pixel pet (cat, dog or duck) that lives on your Claude Desktop window, plus a menu of your own favourite web games for while Claude works. macOS only.

## How it works

```
Claude Desktop ──(extension, stdio)──▶ server/index.js  (MCP server, node)
Claude Code    ──(user MCP, stdio)───▶ server/index.js
                                          │ launches via LaunchServices, unix socket
                                          ▼
                                   IdlePaws.app  (Swift overlay)
                                   ├─ transparent panel over Claude's window (click-through except pet/console)
                                   ├─ Accessibility: finds the "Prompt" composer → pet's floor
                                   ├─ WKWebView: pet + console (web/overlay)
                                   └─ http://localhost:4747 → games menu (web/games) + /games.json
```

- One overlay instance; every MCP server holds a lease on `~/Library/Application Support/idle-paws/pets.sock`.
- The app quits when Claude Desktop quits or no MCP server is attached for 20s.
- The overlay is its own app so the Accessibility grant covers only Idle Paws.

## Use

- **Click** the pet: hearts. **Double-click**: throw the ball. **Right-click**: console. **Drag**: move it.
- **Reacts to Claude Code:** when a session finishes (`Stop` hook) the pet hops and says *Done! · project*; when Claude needs you (`Notification` hook) it shows *!* and *Claude needs you*. Install/remove the hooks with `node scripts/install-hooks.mjs [--remove]` (idempotent, backs up `~/.claude/settings.json`). Chat-tab conversations have no hooks, so they don't trigger reactions.
- Console: throw ball, hide (a paw print stays; double-click it), pet (cat / dog / duck), mode (Auto / Follow me), colour, size, speed, **Play games**.
- Pets are built from shape primitives in `web/overlay/sprites.js` (`SPECIES`: poses `stand`/`sit`/`sleep` + palettes).
- **Games are your own links, editable any time** from three places:
  - the games menu: **+ Add game** card (link + optional name) and a × on each card (click twice);
  - Claude: *add murdoku.com to my games*, *remove chess puzzles*, *list my games* (`add_game` / `remove_game` / `list_games`);
  - Claude Desktop → Settings → Extensions → Idle Paws → **Games** (a link or `Name | link` per entry; comma/newline-separated also works).
- One list (prefs `games`). Settings apply as a diff (`settingsGames` remembers the last settings list): links added there are added, links removed there are removed, games added elsewhere are kept, and a game removed in the menu stays removed. Links are normalised (http/https only, bare origins get `/`), duplicates refused, max 60.
- The menu adds/removes via `POST /games`, which only accepts JSON from the menu's own origin (cross-site pages get 403/415). Cards show the game's preview image (`og:image` / `twitter:image`, looked up once and cached), else just the name; two per row. With no games, the console button reads **＋ Add games** and opens the menu.
- **Play games** drives Claude's own browser pane through Accessibility (Browser toggle → reuse our tab or New tab → type the URL into Page URL → Return) and opens the games menu. No Claude turn involved; works while Claude is busy.
- Ask Claude: *open game*, *open console*, *show/hide pet*, *pet status*.

## Build & install

```bash
npm test                 # game-link parser tests
scripts/build.sh         # dist/IdlePaws.app + dist/idle-paws.mcpb
open dist/idle-paws.mcpb
```

- Builds with `swiftc` directly (SwiftPM in Command Line Tools is broken here); picks the newest SDK the compiler accepts.
- Signs with the `Claude Pets Dev` keychain identity so the Accessibility grant survives rebuilds (falls back to ad-hoc).
- Grant System Settings → Privacy & Security → Accessibility → Idle Paws. Without it the floor falls back to a fixed offset.
- Claude Code: `claude mcp add idle-paws -s user -e IDLE_PAWS_CLIENT=code -- node "<extension dir>/server/index.js"`.

## Diagnostics

- Log: `~/Library/Logs/idle-paws.log`
- Probe Claude's inputs: `open -n -W dist/IdlePaws.app --args --probe-ax`; buttons/fields: `--probe-buttons`
- A1 CPU benchmark (AX on vs off): `scripts/cpu-bench.py --rounds 2 --seconds 60` (last result: `bench/a1-idle.txt`)
- Web inspector: Safari → Develop → Idle Paws.

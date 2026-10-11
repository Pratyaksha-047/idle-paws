# Claude Pets

A pixel cat that lives on your Claude Desktop window, plus mini games (2048, Sudoku, Minesweeper, Snake, Tetris) for while Claude works. macOS only.

## How it works

```
Claude Desktop ──(extension, stdio)──▶ server/index.js  (MCP server, node)
Claude Code    ──(user MCP, stdio)───▶ server/index.js
                                          │ launches via LaunchServices, unix socket
                                          ▼
                                   ClaudePets.app  (Swift overlay)
                                   ├─ transparent panel over Claude's window (click-through except pet/console)
                                   ├─ Accessibility: finds the "Prompt" composer → pet's floor
                                   ├─ WKWebView: pet + console (web/overlay)
                                   └─ http://localhost:4747 → games (web/games)
```

- One overlay instance; every MCP server holds a lease on `~/Library/Application Support/claude-pets/pets.sock`.
- The app quits when Claude Desktop quits or no MCP server is attached for 20s.
- The overlay is its own app so the Accessibility grant covers only Claude Pets.

## Use

- **Click** the cat: it purrs. **Double-click**: console. **Drag**: move it.
- Console: throw ball, hide (a paw print stays; double-click it), mode (Auto / Follow me), color, size, speed, **Play games**.
- **Play games** drives Claude's own browser pane through Accessibility (Browser toggle → reuse our tab or New tab → type the URL into Page URL → Return) and opens the games menu. No Claude turn involved; works while Claude is busy.
- Games live in `web/games/<name>/` (`engine.js` = pure logic with tests in `tests/`, `ui.js` = page). Add one by creating the folder, a thumbnail in `web/games/thumbs/`, a card in `web/games/index.html`, and the id in `GAMES` in `server/index.js`.
- Ask Claude: *open game*, *open console*, *show/hide pet*, *pet status*.

## Build & install

```bash
npm test                 # game engine tests
scripts/build.sh         # dist/ClaudePets.app + dist/claude-pets.mcpb
open dist/claude-pets.mcpb
```

- Builds with `swiftc` directly (SwiftPM in Command Line Tools is broken here); picks the newest SDK the compiler accepts.
- Signs with the `Claude Pets Dev` keychain identity so the Accessibility grant survives rebuilds (falls back to ad-hoc).
- Grant System Settings → Privacy & Security → Accessibility → ClaudePets. Without it the floor falls back to a fixed offset.
- Claude Code: `claude mcp add claude-pets -s user -e CLAUDE_PETS_CLIENT=code -- node "<extension dir>/server/index.js"`.

## Diagnostics

- Log: `~/Library/Logs/claude-pets.log`
- Probe Claude's inputs: `open -n -W dist/ClaudePets.app --args --probe-ax`; buttons/fields: `--probe-buttons`
- A1 CPU benchmark (AX on vs off): `scripts/cpu-bench.py --rounds 2 --seconds 60` (last result: `bench/a1-idle.txt`)
- Web inspector: Safari → Develop → ClaudePets.

#!/usr/bin/env python3
"""A1 benchmark: CPU / memory cost of Chromium's accessibility tree in Claude Desktop.

Interleaves AX-off and AX-on windows (ABAB...) so drift in Claude's own load affects both.
CPU is computed from cumulative CPU time deltas (accurate), not `ps %cpu` (decayed).

  scripts/cpu-bench.py --rounds 2 --seconds 60 --label idle
"""
import argparse
import json
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "dist" / "ClaudePets.app"
CLAUDE_PREFIX = "/Applications/Claude.app/"


def claude_processes():
    """pid -> (kind, cpu_seconds, rss_kb) for Claude Desktop's own processes."""
    out = subprocess.run(["ps", "-axo", "pid=,time=,rss=,comm="], capture_output=True, text=True).stdout
    procs = {}
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4 or not parts[3].startswith(CLAUDE_PREFIX):
            continue
        comm = parts[3]
        if "/Helpers/" in comm and "Claude Helper" not in comm:
            continue  # disclaimer / native hosts, not Chromium
        kind = "renderer" if "(Renderer)" in comm else "gpu/helper" if "Claude Helper" in comm else "main"
        procs[int(parts[0])] = (kind, cpu_seconds(parts[1]), int(parts[2]))
    return procs


def cpu_seconds(text):
    days = 0
    if "-" in text:
        d, text = text.split("-", 1)
        days = int(d)
    fields = [float(x) for x in text.split(":")]
    seconds = 0.0
    for f in fields:
        seconds = seconds * 60 + f
    return days * 86400 + seconds


def set_ax(on):
    subprocess.run(["open", "-n", "-W", str(APP), "--args", "--ax", "on" if on else "off"], check=True)


def measure(seconds):
    samples = []
    rss = []
    prev = claude_processes()
    prev_t = time.monotonic()
    for _ in range(seconds):
        time.sleep(1)
        cur = claude_processes()
        now = time.monotonic()
        dt = now - prev_t
        used = sum(cur[p][1] - prev[p][1] for p in cur if p in prev)
        samples.append(100.0 * used / dt)
        rss.append(sum(v[2] for v in cur.values()) / 1024)
        prev, prev_t = cur, now
    samples.sort()
    return {
        "mean": statistics.mean(samples),
        "p95": samples[int(0.95 * (len(samples) - 1))],
        "max": samples[-1],
        "rss_mb": statistics.mean(rss),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--settle", type=int, default=10)
    parser.add_argument("--label", default="idle")
    args = parser.parse_args()

    results = {"off": [], "on": []}
    for round_no in range(args.rounds):
        for mode in ("off", "on"):
            set_ax(mode == "on")
            time.sleep(args.settle)
            r = measure(args.seconds)
            results[mode].append(r)
            print(f"[{args.label}] round {round_no + 1} ax={mode}: "
                  f"cpu mean {r['mean']:.1f}% p95 {r['p95']:.1f}% max {r['max']:.1f}% rss {r['rss_mb']:.0f}MB", flush=True)
    set_ax(False)

    def avg(mode, key):
        return statistics.mean(r[key] for r in results[mode])

    summary = {k: round(avg("on", k) - avg("off", k), 2) for k in ("mean", "p95", "max", "rss_mb")}
    verdict = summary["mean"] < 2 and summary["p95"] < 5 and summary["rss_mb"] < 50
    print(f"[{args.label}] DELTA on-off: cpu mean {summary['mean']:+.1f}pp p95 {summary['p95']:+.1f}pp "
          f"max {summary['max']:+.1f}pp rss {summary['rss_mb']:+.0f}MB -> {'PASS' if verdict else 'FAIL'} "
          f"(gate: mean<2pp, p95<5pp, rss<50MB)")
    out = ROOT / "bench"
    out.mkdir(exist_ok=True)
    (out / f"a1-{args.label}-{int(time.time())}.json").write_text(json.dumps({"results": results, "delta": summary}, indent=2))


if __name__ == "__main__":
    main()

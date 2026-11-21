#!/usr/bin/env python3
"""Rank Warren's harness results against aisandboxbench.com's published results.

    python3 compare.py published.json warren-main.json [warren-snapshot.json warren-burst.json ...]

Both sides come from the same harness (opencoredev/sandbox-sdk), so metric ids
and definitions match. Warren's medians are converted to the published units.
Prints a Markdown table; the caveats it prints are part of the result.
"""
import json
import sys

pub = json.load(open(sys.argv[1]))["tracks"]["same-spec"]
ours = {}
for path in sys.argv[2:]:
    r = json.load(open(path))
    for s in r["summaries"]:
        if s["provider"] == "warren" and s["stats"]["count"]:
            ours[s["scenario"]] = s

# Published metric id -> harness scenario id (where they differ).
alias = {
    "memory": "memory-mbps", "disk-write": "disk-write-mbps", "disk-read": "disk-read-mbps",
    "iops-write": "disk-4k-write-iops", "iops-read": "disk-4k-read-iops",
    "burst-10": "burst-10/all-ready", "burst-25": "burst-25/all-ready",
}
names = {p["id"]: p.get("name", p["id"]) for p in pub["providers"]} if isinstance(pub.get("providers"), list) else {}


def convert(value, from_unit, to_unit):
    if from_unit == to_unit:
        return value
    if from_unit == "ms" and to_unit == "s":
        return value / 1000
    if from_unit == "iterations/s" and to_unit == "ops/s":  # site-data relabels the same rate
        return value
    return None


rows, wins, measured = [], 0, 0
for m in pub["metrics"]:
    s = ours.get(alias.get(m["id"], m["id"]))
    published = [r for r in m["results"] if r.get("median") is not None and r.get("status") == "measured"]
    if not s or not published:
        rows.append(f"| {m['label']} | not measured | | | |")
        continue
    v = convert(s["stats"]["p50"], s["unit"], m["unit"])
    if v is None:
        rows.append(f"| {m['label']} | unit mismatch ({s['unit']} vs {m['unit']}) | | | |")
        continue
    lower = m["better"] == "lower"
    # Rank only against first-tier, equal-spec rows, as the site does.
    field = [r for r in published if r.get("equalSpec", True) and not str(r["provider"]).startswith("beam-")]
    better_than_us = sum(1 for r in field if (r["median"] < v if lower else r["median"] > v))
    rank = better_than_us + 1
    best = min(field, key=lambda r: r["median"]) if lower else max(field, key=lambda r: r["median"])
    measured += 1
    wins += rank == 1
    fmt = (lambda x: f"{x:.3g}") if m["unit"] in ("s",) else (lambda x: f"{x:,.0f}")
    rows.append(
        f"| {m['label']} | **{fmt(v)} {m['unit']}** | {rank} of {len(field) + 1} | "
        f"{names.get(best['provider'], best['provider'])} {fmt(best['median'])} | "
        f"{s['stats']['count']} runs, {s['failures']} failed |"
    )

print("| metric (same machine, 4 vCPU / 8 GB) | Warren median | Warren rank | published best | Warren sample |")
print("|---|---|---|---|---|")
print("\n".join(rows))
print(f"\nWarren ranks first on {wins} of {measured} metrics it was measured on.")

# Network-adjusted cold start. Cold start = create call + first command, so it
# contains at least two client<->provider round trips; "Run a command" is about
# one. Subtracting 2x each provider's own command median removes most of the
# network distance on both sides (Florida->provider for published rows, this
# client->Warren for ours). It is an estimate, shown next to the raw numbers.
by_id = {m["id"]: {r["provider"]: r["median"] for r in m["results"] if r.get("median") is not None} for m in pub["metrics"]}
cold, cmd = by_id.get("cold", {}), by_id.get("command", {})
adj = sorted(
    [(names.get(p, p), cold[p], cmd[p], cold[p] - 2 * cmd[p]) for p in cold if p in cmd and not p.startswith("beam-")],
    key=lambda x: x[3],
)
if "cold" in ours and "command" in ours:
    wc, wm = ours["cold"]["stats"]["p50"] / 1000, ours["command"]["stats"]["p50"] / 1000
    adj.append(("**Warren**", wc, wm, wc - 2 * wm))
    adj.sort(key=lambda x: x[3])
print("\n| provider | cold start | run a command | cold - 2 x command (network-adjusted) |")
print("|---|---|---|---|")
for n, c, m_, a in adj:
    print(f"| {n} | {c:.3f} s | {m_:.3f} s | {a:.3f} s |")

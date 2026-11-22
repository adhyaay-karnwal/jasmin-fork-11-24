// Builds src/data/leaderboard.json: every provider aisandboxbench.com publishes on its
// same-machine track (4 vCPU / 8 GB), plus Jasmine measured with the same harness.
//
//   node scripts/build-leaderboard.mjs
//
// Inputs (committed): ../results/aisandboxbench-published-2026-11-20.json (their published
// results, trimmed) and ../results/raw-2026-11-21/*/results.json.gz (Jasmine's raw harness output).
// Ranking follows aisandboxbench's own rule: only equal-spec, first-tier rows are ranked
// (Beam Shared / Beam Spot and rows whose machine wasn't 4 vCPU / 8 GB are shown, not ranked).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "../..");
const pub = JSON.parse(fs.readFileSync(path.join(root, "results/aisandboxbench-published-2026-11-20.json"), "utf8"));

// Jasmine's harness summaries. Where a scenario appears in several suites, the main suite
// (largest sample) wins.
const ours = {};
for (const suite of ["burst", "snapshot", "main"]) {
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, `results/raw-2026-11-21/${suite}/results.json.gz`))));
  for (const s of raw.summaries) {
    if (!["jasmine", "warren"].includes(s.provider) || !s.stats.count) continue;
    ours[s.scenario] = s;
  }
}

const alias = {
  memory: "memory-mbps", "disk-write": "disk-write-mbps", "disk-read": "disk-read-mbps",
  "iops-write": "disk-4k-write-iops", "iops-read": "disk-4k-read-iops",
  "burst-10": "burst-10/all-ready", "burst-25": "burst-25/all-ready",
};
const conv = (v, from, to) => (from === to ? v : from === "ms" && to === "s" ? v / 1000 : v);

const names = Object.fromEntries(pub.providers.map((p) => [p.id, p.name]));
const providers = pub.providers.map((p) => ({ ...p, ranked: p.equalSpec !== false && !p.id.startsWith("beam-") }));
providers.push({ id: "jasmine", name: "Jasmine", ranIn: "GitHub Actions runner, Iowa (self-hosted)", cpu: "AMD EPYC 7763 (nested virtualization)", equalSpec: true, measured: "4 vCPU, 8 GB", ranked: true });

const metrics = pub.metrics.map((m) => {
  const lower = m.better === "lower";
  const rows = m.results.map((r) => ({
    provider: r.provider,
    name: names[r.provider] ?? r.provider,
    median: r.median,
    p95: r.p95 ?? null,
    ci95: r.ci95 ?? null,
    attempts: r.attempts ?? null,
    failed: r.failed ?? 0,
    note: r.status === "measured" ? null : String(r.status).replace(/^[a-z-]+: ?/, "") || r.status,
    status: r.status === "measured" ? "measured" : String(r.status).split(":")[0],
    ranked: r.status === "measured" && r.median != null && r.equalSpec !== false && !String(r.provider).startsWith("beam-"),
  }));
  const s = ours[alias[m.id] ?? m.id];
  if (s) {
    const c = (x) => conv(x, s.unit, m.unit);
    rows.push({
      provider: "jasmine", name: "Jasmine", median: c(s.stats.p50), p95: c(s.stats.p95),
      ci95: s.stats.p50CI ? [c(s.stats.p50CI.low), c(s.stats.p50CI.high)] : null,
      attempts: s.success?.total ?? s.stats.count, failed: s.failures, note: null, status: "measured", ranked: true,
    });
  }
  const ranked = rows.filter((r) => r.ranked).sort((a, b) => (lower ? a.median - b.median : b.median - a.median));
  ranked.forEach((r, i) => (r.rank = i + 1));
  const rest = rows.filter((r) => !r.ranked);
  return {
    id: m.id, group: m.group, label: m.label, unit: m.unit, better: m.better,
    rows: [...ranked, ...rest.filter((r) => r.median != null), ...rest.filter((r) => r.median == null)],
    of: ranked.length,
    jasmineRank: ranked.find((r) => r.provider === "jasmine")?.rank ?? null,
  };
});

const out = {
  source: pub.source, fetched: pub.fetched, track: pub.label, description: pub.description,
  run: pub.run, providers, metrics,
  wins: metrics.filter((m) => m.jasmineRank === 1).length,
  podium: metrics.filter((m) => m.jasmineRank && m.jasmineRank <= 3).length,
  measured: metrics.filter((m) => m.jasmineRank).length,
};
fs.writeFileSync(path.join(import.meta.dirname, "../src/data/leaderboard.json"), JSON.stringify(out, null, 1));
console.log(`wrote leaderboard.json: ${metrics.length} metrics, ${providers.length} providers; Jasmine #1 on ${out.wins}/${out.measured}, top 3 on ${out.podium}`);
for (const m of metrics) console.log(`  ${m.id.padEnd(22)} #${m.jasmineRank} of ${m.of}`);

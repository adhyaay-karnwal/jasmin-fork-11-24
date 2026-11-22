#!/usr/bin/env node
// Copy a fairbench result's summaries into the site: node scripts/sync-fairbench.mjs <fairbench.json> [--label "..."]
import { readFileSync, writeFileSync } from "node:fs";

const [src] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const li = process.argv.indexOf("--label");
const r = JSON.parse(readFileSync(src, "utf8"));
const out = {
  label: li > 0 ? process.argv[li + 1] : null,
  version: r.config.version,
  seed: r.config.seed,
  rounds: r.config.rounds,
  heavyRounds: r.config.heavyRounds,
  limits: { cpu: r.config.cpu, memoryMb: r.config.memoryMb, image: r.config.image },
  host: r.host,
  finishedAt: r.finishedAt,
  systems: r.systems,
  metrics: Object.fromEntries(
    Object.entries(r.metrics).map(([k, m]) => [
      k,
      {
        better: m.better,
        winner: m.winner,
        failures: m.failures,
        bySystem: Object.fromEntries(
          Object.entries(m.bySystem).map(([s, v]) => [s, v && { n: v.n, median: v.median, ci95: v.ci95, p95: v.p95 }]),
        ),
      },
    ]),
  ),
};
writeFileSync(new URL("../src/data/fairbench.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`synced ${Object.keys(out.metrics).length} metrics, systems: ${Object.keys(out.systems).join(", ")}`);

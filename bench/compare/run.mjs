#!/usr/bin/env node
// Provider-neutral sandbox benchmark.
//
//   node bench/compare/run.mjs [--providers azami,e2b,daytona] [--samples 50] [--out file.json]
//
// Rules (see README "Benchmark rules"): identical workloads, official SDKs with
// default settings, wall-clock timing on this client, every sample kept,
// failures counted rather than dropped. The network round trip to each
// provider's API is measured and reported next to its numbers, so a local
// provider is never silently compared with a remote one.

import { writeFileSync } from "node:fs";
import os from "node:os";
import { adapters } from "./adapters.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SAMPLES = Number(arg("samples", 30));
const OUT = arg("out");
const wanted = arg("providers", Object.keys(adapters).join(",")).split(",");
const now = () => performance.now();

function stats(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (x) => Math.round(x * 10) / 10;
  return { n: s.length, p50: r(q(0.5)), p90: r(q(0.9)), p99: r(q(0.99)), min: r(s[0]), max: r(s.at(-1)) };
}

async function rtt(url) {
  // Median of small HTTPS requests over a kept-alive connection; first one warms DNS/TLS.
  const xs = [];
  for (let i = 0; i < 11; i++) {
    const t = now();
    try {
      await (await fetch(url, { method: "GET" })).arrayBuffer();
    } catch {
      return null;
    }
    if (i) xs.push(now() - t);
  }
  return stats(xs).p50;
}

// Workloads. Each is the same shell command for every provider.
const WORKLOADS = {
  python_hello: "python3 -c 'print(42)'",
  numpy_matmul:
    "python3 -c 'import numpy' 2>/dev/null || pip install -q numpy >/dev/null 2>&1; python3 -c 'import numpy as n; a=n.random.rand(800,800); print(round(float((a@a).sum())>0))'",
  pip_install_requests: "pip install -q --no-cache-dir requests >/dev/null 2>&1 && python3 -c 'import requests; print(1)'",
  disk_write_256mib: "dd if=/dev/zero of=/tmp/w bs=1M count=256 conv=fsync 2>/dev/null && rm /tmp/w && echo 1",
};

async function benchProvider(a) {
  const res = { provider: a.name, isolation: a.isolation, samples: SAMPLES, errors: [], metrics: {} };
  res.api_rtt_ms = a.endpoint().startsWith("http://127.") ? 0 : await rtt(a.endpoint());
  await a.init();
  const m = { create: [], create_to_first_exec: [], exec_warm: [], destroy: [], file_1mib_roundtrip: [] };
  const work = Object.fromEntries(Object.keys(WORKLOADS).map((k) => [k, []]));

  for (let i = 0; i < SAMPLES; i++) {
    let s;
    try {
      const t0 = now();
      s = await a.create();
      const t1 = now();
      const r = await a.exec(s, "echo ready");
      if (r.stdout.trim() !== "ready") throw new Error(`bad first exec output: ${JSON.stringify(r)}`);
      m.create.push(t1 - t0);
      m.create_to_first_exec.push(now() - t0);

      for (let j = 0; j < 5; j++) {
        const t = now();
        await a.exec(s, "true");
        m.exec_warm.push(now() - t);
      }
      const blob = new Uint8Array(1 << 20).map((_, k) => (k * 31 + i) & 255);
      let t = now();
      await a.write(s, "/tmp/bench.bin", blob);
      const back = await a.read(s, "/tmp/bench.bin");
      if (back.length !== blob.length || back[12345] !== blob[12345]) throw new Error("file roundtrip mismatch");
      m.file_1mib_roundtrip.push(now() - t);

      // Heavier workloads on a subset of samples (they dominate wall time).
      if (i < Math.min(5, SAMPLES)) {
        for (const [k, cmd] of Object.entries(WORKLOADS)) {
          t = now();
          const w = await a.exec(s, cmd);
          if (w.exitCode !== 0 || !w.stdout.trim().endsWith("1") && !w.stdout.trim().endsWith("42")) {
            res.errors.push(`${k}: exit ${w.exitCode} ${w.stdout.slice(-200)}`);
          } else work[k].push(now() - t);
        }
      }
      t = now();
      await a.destroy(s);
      s = null;
      m.destroy.push(now() - t);
    } catch (e) {
      res.errors.push(String(e?.message ?? e).slice(0, 300));
      if (s) await a.destroy(s).catch(() => {});
    }
    process.stderr.write(`\r${a.name} ${i + 1}/${SAMPLES}`);
  }
  process.stderr.write("\n");
  for (const [k, v] of Object.entries({ ...m, ...work })) res.metrics[`${k}_ms`] = stats(v);
  res.error_rate = Math.round((res.errors.length / SAMPLES) * 1000) / 1000;
  return res;
}

const report = {
  at: new Date().toISOString(),
  client: { platform: `${os.platform()} ${os.arch()}`, cpus: os.cpus().length, cpu: os.cpus()[0]?.model, node: process.version },
  workloads: WORKLOADS,
  results: [],
};
for (const name of wanted) {
  const a = adapters[name];
  if (!a) throw new Error(`unknown provider ${name}`);
  if (!a.available()) {
    console.error(`skip ${name}: no credentials`);
    report.results.push({ provider: name, skipped: "no credentials" });
    continue;
  }
  report.results.push(await benchProvider(a));
}

// Table.
const cols = ["create_ms", "create_to_first_exec_ms", "exec_warm_ms", "file_1mib_roundtrip_ms", ...Object.keys(WORKLOADS).map((k) => `${k}_ms`)];
console.log(`\n${"provider".padEnd(10)} ${"rtt".padStart(6)} ${cols.map((c) => c.replace(/_ms$/, "").padStart(22)).join(" ")}  err`);
for (const r of report.results) {
  if (r.skipped) {
    console.log(`${r.provider.padEnd(10)} skipped (${r.skipped})`);
    continue;
  }
  const cell = (c) => (r.metrics[c] ? `${r.metrics[c].p50}/${r.metrics[c].p90}` : "-").padStart(22);
  console.log(`${r.provider.padEnd(10)} ${String(r.api_rtt_ms ?? "?").padStart(6)} ${cols.map(cell).join(" ")}  ${r.error_rate}`);
}
console.log("(cells: p50/p90 ms, measured on this client; rtt = median HTTPS round trip to the provider API)");
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));

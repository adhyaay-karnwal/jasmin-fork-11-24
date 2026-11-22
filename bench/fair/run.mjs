#!/usr/bin/env node
// fairbench: same-host, interleaved, held-out sandbox benchmark. See README.md.
//
//   sudo -E node bench/fair/run.mjs --systems jasmine,docker,gvisor,kata --rounds 15 --out results.json
//
// Every system runs on this host, gets the same image and CPU/memory limit, and
// is driven by this one client over local sockets. Rounds interleave systems in
// a fresh random order. The agent trace is generated from a seed chosen at run
// time. No composite score: medians with bootstrap CIs, ties declared as ties.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dockerSystem } from "./systems/docker.mjs";
import { jasmineSystem } from "./systems/jasmine.mjs";
import { rng, summarize, winner } from "./lib/stats.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const CFG = {
  version: "fairbench-1",
  image: arg("image", "node:22-bookworm"),
  cpu: Number(arg("cpu", 2)),
  memoryMb: Number(arg("memory-mb", 4096)),
  rounds: Number(arg("rounds", 15)),
  heavyRounds: Number(arg("heavy-rounds", 5)),
  bursts: arg("bursts", "1,5,10,25").split(",").map(Number),
  burstCohorts: Number(arg("burst-cohorts", 3)),
  densityN: Number(arg("density", 20)),
  // Chosen at run time unless pinned, so nobody can tune for the exact trace.
  seed: Number(arg("seed", Math.floor(Math.random() * 2 ** 31))),
};
const OUT = arg("out", "fairbench-results.json");

const ALL = {
  jasmine: () => jasmineSystem({ template: arg("jasmine-template", "fair") }),
  docker: () => dockerSystem({ name: "docker", runtime: "runc", isolation: "container (runc)" }),
  gvisor: () => dockerSystem({ name: "gvisor", runtime: "runsc", isolation: "user-space kernel (gVisor)" }),
  kata: () => dockerSystem({ name: "kata", runtime: "kata", isolation: "microVM (Kata Containers)" }),
};

const now = () => performance.now();
const samples = {}; // samples[system][metric] = number[]
const failures = {}; // failures[system][metric] = [messages]
const rec = (sys, m, v) => ((samples[sys] ??= {})[m] ??= []).push(v);
const fail = (sys, m, e) => {
  ((failures[sys] ??= {})[m] ??= []).push(String(e?.message ?? e).slice(0, 300));
  console.error(`  ! ${sys}/${m}: ${String(e?.message ?? e).slice(0, 200)}`);
};

async function must(sys, h, cmd, opts) {
  const r = await sys.exec(h, cmd, opts);
  if (r.exitCode !== 0) throw new Error(`exit ${r.exitCode}: ${cmd.slice(0, 80)} :: stdout ${r.stdout.slice(-200)} :: stderr ${r.stderr.slice(-300)}`);
  return r;
}

async function timed(sys, metric, fn) {
  try {
    const t = now();
    const v = await fn();
    // Workloads return a measured number only when they time something themselves.
    rec(sys.name, metric, typeof v === "number" ? v : now() - t);
  } catch (e) {
    fail(sys.name, metric, e);
  }
}

// ---------- workloads (frozen for fairbench-1) ----------
const W = {
  compute: `python3 -c "n=3_000_000
s=bytearray([1])*(n+1); s[0]=s[1]=0
for i in range(2,int(n**.5)+1):
    if s[i]: s[i*i::i]=bytearray(len(s[i*i::i]))
print(sum(s))"`,
  smallFilesFsync: `python3 -c "import os
os.makedirs('/workspace/fs',exist_ok=True)
for i in range(500):
    fd=os.open(f'/workspace/fs/{i}',os.O_WRONLY|os.O_CREAT|os.O_TRUNC); os.write(fd,b'x'*4096); os.fsync(fd); os.close(fd)
print('ok')"`,
  bigWrite: `dd if=/dev/zero of=/workspace/big bs=1M count=512 conv=fsync status=none && rm /workspace/big && echo ok`,
  python: `rm -rf /workspace/sj && git -c advice.detachedHead=false clone -q --depth 1 -b v3.19.3 https://github.com/simplejson/simplejson /workspace/sj && cd /workspace/sj && for i in 1 2 3 4 5 6 7 8 9 10; do python3 -m unittest discover -s simplejson/tests -t . -q 2>&1 | tail -1 | grep -q OK || exit 1; done && echo ok`,
  nodeBuild: `cd /workspace/app && npm ci --no-audit --no-fund --loglevel=error && npx vite build --logLevel error && test -f dist/index.html && echo ok`,
};
const fixtureDir = join(here, "fixtures/vite-react");
const fixture = readdirSync(fixtureDir).filter((f) => f !== "NOTICE").map((f) => [f, readFileSync(join(fixtureDir, f))]);

// Held-out agent trace: generated per round from the run's seed. Same trace for
// every system within a round; different every run.
function trace(seed) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const word = () => Math.floor(r() * 36 ** 6).toString(36);
  const ops = [{ kind: "exec", cmd: "mkdir -p /workspace/t" }];
  const files = [];
  for (let i = 0; i < 40; i++) {
    const n = 1000 + Math.floor(r() * 200000);
    const choice = files.length ? pick(["write", "write", "read", "ls", "grep", "py", "node", "sed", "hash"]) : "write";
    if (choice === "write") {
      const path = `/workspace/t/f${i}.txt`;
      files.push(path);
      ops.push({ kind: "write", path, data: Buffer.from(Array.from({ length: 50 + Math.floor(r() * 400) }, word).join(" ")) });
    } else if (choice === "read") ops.push({ kind: "read", path: pick(files) });
    else if (choice === "ls") ops.push({ kind: "exec", cmd: "ls -la /workspace/t | wc -l" });
    else if (choice === "grep") ops.push({ kind: "exec", cmd: `grep -rl ${word()} /workspace/t || true` });
    else if (choice === "py") ops.push({ kind: "exec", cmd: `python3 -c "import json; print(len(json.dumps(list(range(${n})))))"` });
    else if (choice === "node") ops.push({ kind: "exec", cmd: `node -e "let s=0; for (let i=0;i<${n};i++) s+=i; console.log(s)"` });
    else if (choice === "sed") ops.push({ kind: "exec", cmd: `sed -i 's/a/b/g' ${pick(files)}` });
    else ops.push({ kind: "exec", cmd: `sha256sum ${pick(files)}` });
  }
  return ops;
}

async function runTrace(sys, h, ops) {
  for (const op of ops) {
    if (op.kind === "write") await sys.writeFile(h, op.path, op.data);
    else if (op.kind === "read") await sys.readFile(h, op.path);
    else await must(sys, h, op.cmd);
  }
}

async function roundtrip(sys, h, size, tag) {
  const data = new Uint8Array(size).map((_, i) => (i * 131 + size) & 255);
  const path = `/workspace/rt-${tag}.bin`;
  await sys.writeFile(h, path, data);
  const back = await sys.readFile(h, path);
  if (back.length !== size || back[size >> 1] !== data[size >> 1] || back[size - 1] !== data[size - 1]) throw new Error("file roundtrip mismatch");
}

const spec = () => ({ image: CFG.image, cpu: CFG.cpu, memoryMb: CFG.memoryMb });

async function perSandbox(sys, round) {
  let h;
  try {
    const t0 = now();
    h = await sys.create(spec());
    await must(sys, h, "true");
    rec(sys.name, "ready_ms", now() - t0);
  } catch (e) {
    fail(sys.name, "ready_ms", e);
    if (h) await sys.destroy(h).catch(() => {});
    return;
  }
  await timed(sys, "exec_ms", async () => {
    const xs = [];
    for (let i = 0; i < 5; i++) {
      const t = now();
      await must(sys, h, "true");
      xs.push(now() - t);
    }
    return xs.sort((a, b) => a - b)[2];
  });
  await timed(sys, "files_1k_ms", () => roundtrip(sys, h, 1024, "1k"));
  await timed(sys, "files_16m_ms", () => roundtrip(sys, h, 16 << 20, "16m"));
  await timed(sys, "compute_ms", () => must(sys, h, W.compute));
  await timed(sys, "small_fsync_ms", () => must(sys, h, W.smallFilesFsync));
  await timed(sys, "big_write_ms", () => must(sys, h, W.bigWrite));
  await timed(sys, "agent_trace_ms", () => runTrace(sys, h, trace(CFG.seed + round)));
  if (round < CFG.heavyRounds) {
    await timed(sys, "task_python_ms", () => must(sys, h, W.python));
    await timed(sys, "task_node_build_ms", async () => {
      for (const [f, d] of fixture) await sys.writeFile(h, `/workspace/app/${f}`, d);
      await must(sys, h, W.nodeBuild);
    });
  }
  await timed(sys, "destroy_ms", () => sys.destroy(h));
}

async function burst(sys, k) {
  const t0 = now();
  const handles = [];
  const results = await Promise.allSettled(
    Array.from({ length: k }, async () => {
      const h = await sys.create(spec());
      handles.push(h);
      await must(sys, h, "true");
    }),
  );
  const wall = now() - t0;
  await Promise.allSettled(handles.map((h) => sys.destroy(h)));
  const bad = results.filter((r) => r.status === "rejected");
  if (bad.length) throw new Error(`${bad.length}/${k} failed: ${bad[0].reason?.message ?? bad[0].reason}`);
  return wall;
}

// Host memory, after dropping clean caches; median of 3 readings to damp noise.
// available: what the kernel could still hand out (clean file pages, e.g. a
//   shared snapshot, count as reclaimable). used: MemTotal - MemFree (counts
//   every resident page, shared ones once). Both are reported.
function hostMem() {
  const reads = [];
  for (let i = 0; i < 3; i++) {
    execSync("sync; echo 3 > /proc/sys/vm/drop_caches; sleep 0.5");
    const t = readFileSync("/proc/meminfo", "utf8");
    const g = (k) => Number(t.match(new RegExp(`${k}:\\s+(\\d+)`))[1]) / 1024;
    reads.push({ available: g("MemAvailable"), used: g("MemTotal") - g("MemFree") });
  }
  const med = (k) => reads.map((r) => r[k]).sort((a, b) => a - b)[1];
  return { available: med("available"), used: med("used") };
}

// Wait until host memory stops moving (earlier phases' background cleanup must
// not leak into this measurement): two consecutive readings within 16 MiB.
async function settledHostMem() {
  let prev = hostMem();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const cur = hostMem();
    if (Math.abs(cur.used - prev.used) < 16 && Math.abs(cur.available - prev.available) < 16) return cur;
    prev = cur;
  }
  return prev;
}

async function density(sys) {
  const before = await settledHostMem();
  const hs = [];
  try {
    for (let i = 0; i < CFG.densityN; i++) {
      const h = await sys.create(spec());
      hs.push(h);
      await must(sys, h, "true");
    }
    const after = await settledHostMem();
    rec(sys.name, "idle_mem_used_per_sandbox_mib", (after.used - before.used) / CFG.densityN);
    return (before.available - after.available) / CFG.densityN;
  } finally {
    await Promise.allSettled(hs.map((h) => sys.destroy(h)));
  }
}

async function noisy(sys) {
  const hs = [];
  try {
    for (let i = 0; i < 4; i++) hs.push(await sys.create(spec()));
    const burn = `nohup python3 -c "import multiprocessing as m, time
def f():
    t=time.time()
    while time.time()-t<60: pass
[m.Process(target=f).start() for _ in range(${CFG.cpu})]" >/dev/null 2>&1 &`;
    for (const h of hs.slice(1)) await must(sys, h, burn);
    await new Promise((r) => setTimeout(r, 1000));
    const xs = [];
    for (let i = 0; i < 30; i++) {
      const t = now();
      await must(sys, hs[0], "true");
      xs.push(now() - t);
    }
    return xs;
  } finally {
    await Promise.allSettled(hs.map((h) => sys.destroy(h)));
  }
}

function shuffle(xs, r) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- main ----------
const hostKernel = os.release();
const report = {
  config: CFG,
  host: { kernel: hostKernel, cpus: os.cpus().length, cpu: os.cpus()[0]?.model, memGiB: Math.round(os.totalmem() / 2 ** 30), node: process.version },
  startedAt: new Date().toISOString(),
  systems: {},
};
console.log(`fairbench seed=${CFG.seed} image=${CFG.image} limits=${CFG.cpu} vCPU/${CFG.memoryMb} MiB`);

const systems = [];
for (const name of arg("systems", "jasmine,docker,gvisor,kata").split(",")) {
  const sys = ALL[name]?.();
  if (!sys) throw new Error(`unknown system ${name}`);
  try {
    await sys.available();
    // Isolation fact: does the sandbox run on the host's kernel?
    const h = await sys.create(spec());
    const k = (await must(sys, h, "uname -r")).stdout.trim();
    const cpus = (await must(sys, h, "nproc")).stdout.trim();
    await sys.destroy(h);
    report.systems[name] = { isolation: sys.isolation, available: true, guestKernel: k, sharesHostKernel: k === hostKernel, nprocInside: Number(cpus) };
    systems.push(sys);
  } catch (e) {
    report.systems[name] = { isolation: sys.isolation, available: false, reason: String(e?.message ?? e).slice(0, 300) };
    console.error(`skip ${name}: ${report.systems[name].reason}`);
  }
}

for (let r = 0; r < CFG.rounds; r++) {
  for (const sys of shuffle(systems, rng(CFG.seed ^ (r * 7919)))) await perSandbox(sys, r);
  console.log(`round ${r + 1}/${CFG.rounds} done`);
}
for (let c = 0; c < CFG.burstCohorts; c++)
  for (const k of CFG.bursts)
    for (const sys of shuffle(systems, rng(CFG.seed ^ (c * 104729 + k)))) await timed(sys, `burst_${k}_all_ready_ms`, () => burst(sys, k));
console.log("bursts done");
for (const sys of shuffle(systems, rng(CFG.seed + 1))) await timed(sys, "idle_mem_available_drop_per_sandbox_mib", () => density(sys));
for (const sys of shuffle(systems, rng(CFG.seed + 2)))
  try {
    for (const x of await noisy(sys)) rec(sys.name, "exec_under_neighbor_load_ms", x);
  } catch (e) {
    fail(sys.name, "exec_under_neighbor_load_ms", e);
  }

// ---------- report ----------
const better = (m) => (m.endsWith("_ms") || m.endsWith("_mib") ? "lower" : "higher");
const metrics = [...new Set(Object.values(samples).flatMap((s) => Object.keys(s)))];
report.metrics = {};
for (const m of metrics) {
  const by = Object.fromEntries(systems.map((s) => [s.name, samples[s.name]?.[m]?.length ? summarize(samples[s.name][m]) : null]));
  report.metrics[m] = { better: better(m), bySystem: by, winner: winner(by, better(m)), failures: Object.fromEntries(systems.map((s) => [s.name, failures[s.name]?.[m]?.length ?? 0])) };
}
report.samples = samples;
report.failures = failures;
report.finishedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(report, null, 2));

const names = systems.map((s) => s.name);
const fmt = (s, m) => (s ? `${s.median >= 100 ? Math.round(s.median) : s.median.toFixed(1)} [${s.ci95.map((x) => (x >= 100 ? Math.round(x) : x.toFixed(1))).join("–")}]` : "—");
let md = `# fairbench results (${CFG.version}, seed ${CFG.seed})\n\n`;
md += `Host: ${report.host.cpu}, ${report.host.cpus} CPUs, ${report.host.memGiB} GiB, kernel ${hostKernel}. Every system: image \`${CFG.image}\`, ${CFG.cpu} vCPU, ${CFG.memoryMb} MiB.\n\n`;
md += `| system | isolation | own kernel | CPUs seen inside |\n|---|---|---|---|\n`;
for (const [n, s] of Object.entries(report.systems))
  md += s.available ? `| ${n} | ${s.isolation} | ${s.sharesHostKernel ? "no (host kernel)" : `yes (${s.guestKernel})`} | ${s.nprocInside} |\n` : `| ${n} | ${s.isolation} | unavailable: ${s.reason} | |\n`;
md += `\nMedian [bootstrap 95% CI]. **Bold** = statistically clear winner (its CI clears every other system's); otherwise a tie. Failures in parentheses.\n\n`;
md += `| metric | ${names.join(" | ")} | winner |\n|---|${names.map(() => "---").join("|")}|---|\n`;
for (const m of metrics) {
  const x = report.metrics[m];
  md += `| ${m} (${x.better} is better) | ${names.map((n) => (x.winner === n ? `**${fmt(x.bySystem[n], m)}**` : fmt(x.bySystem[n], m)) + (x.failures[n] ? ` (${x.failures[n]} failed)` : "")).join(" | ")} | ${x.winner ?? "tie"} |\n`;
}
writeFileSync(OUT.replace(/\.json$/, ".md"), md);
console.log("\n" + md);

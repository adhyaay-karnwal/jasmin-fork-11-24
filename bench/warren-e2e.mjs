#!/usr/bin/env node
// End-to-end correctness checks + micro-benchmarks against a running warrend.
// Timings are measured here, on the client, over the public HTTP API.
//
//   WARREN_URL=http://127.0.0.1:7171 node bench/warren-e2e.mjs [--samples 100] [--burst 20] [--out results.json]

import { writeFileSync } from "node:fs";

const URL_ = process.env.WARREN_URL ?? "http://127.0.0.1:7171";
const KEY = process.env.WARREN_API_KEY;
const TEMPLATE = process.env.WARREN_TEMPLATE ?? "default";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SAMPLES = Number(arg("samples", 50));
const BURST = Number(arg("burst", 10));
const OUT = arg("out");

async function api(method, path, body, raw = false) {
  const headers = {};
  if (KEY) headers.authorization = `Bearer ${KEY}`;
  let payload;
  if (body instanceof Uint8Array) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(URL_ + path, { method, headers, body: payload });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
  if (r.status === 204) return null;
  return raw ? new Uint8Array(await r.arrayBuffer()) : r.json();
}
const create = () => api("POST", "/v1/sandboxes", { template: TEMPLATE });
const exec = (id, cmd, extra = {}) => api("POST", `/v1/sandboxes/${id}/exec`, { cmd, ...extra });
const del = (id) => api("DELETE", `/v1/sandboxes/${id}`);
const now = () => performance.now();

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (x) => Math.round(x * 100) / 100;
  return { n: s.length, min: r(s[0]), p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)), max: r(s.at(-1)), mean: r(s.reduce((a, b) => a + b, 0) / s.length) };
}

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${JSON.stringify(detail)}`}`);
  if (!cond) failures++;
}

// ---------- correctness ----------
const a = await create();
const b = await create();
console.log("create timings (server-side breakdown):", JSON.stringify(a.timings));

let r = await exec(a.id, "echo hello && echo oops >&2 && exit 3");
check("exec stdout/stderr/exit code", r.stdout === "hello\n" && r.stderr === "oops\n" && r.exit_code === 3, r);

r = await exec(a.id, ["cat"], { stdin: "piped input" });
check("exec stdin", r.stdout === "piped input", r);

r = await exec(a.id, "sleep 10", { timeout_ms: 300 });
check("exec timeout kills process", r.timed_out === true && r.duration_ms < 2000, r);

r = await exec(a.id, "sleep 30 & echo started");
check("background job does not hang exec", r.stdout === "started\n" && r.duration_ms < 2000, r);

r = await exec(a.id, "pwd; echo $FOO", { env: { FOO: "bar" }, cwd: "/tmp" });
check("exec env + cwd", r.stdout === "/tmp\nbar\n", r);

const blob = new Uint8Array(3 << 20).map((_, i) => (i * 7919) & 255);
await api("PUT", `/v1/sandboxes/${a.id}/files?path=/root/blob.bin&mode=600`, blob);
const back = await api("GET", `/v1/sandboxes/${a.id}/files?path=/root/blob.bin`, undefined, true);
check("file write/read roundtrip (3 MiB binary)", back.length === blob.length && back.every((x, i) => x === blob[i]), { len: back.length });
r = await exec(a.id, "stat -c %a /root/blob.bin");
check("file mode", r.stdout.trim() === "600", r);

r = await exec(b.id, "test -e /root/blob.bin && echo leak || echo isolated");
check("sandboxes have isolated disks", r.stdout.trim() === "isolated", r);

const [ra, rb] = await Promise.all([a, b].map((s) => exec(s.id, "head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \\n'")));
check("restored sandboxes do not share RNG state", ra.stdout && ra.stdout !== rb.stdout, [ra.stdout, rb.stdout]);

r = await exec(a.id, "date +%s");
check("guest clock synced after restore", Math.abs(Number(r.stdout) - Date.now() / 1000) < 5, r);

const pyNet = (code) => exec(a.id, ["python3", "-c", code], { timeout_ms: 60000 });
r = await pyNet("import urllib.request as u; print(u.urlopen('https://pypi.org/simple/', timeout=15).status)");
check("internet: DNS + HTTPS from sandbox", r.stdout.trim() === "200", r);
r = await exec(a.id, "pip install -q --disable-pip-version-check --root-user-action=ignore six && python3 -c 'import six; print(six.__version__)'", { timeout_ms: 120000 });
check("pip install works", r.exit_code === 0 && /^\d+\.\d+/.test(r.stdout.trim()), r);
const blocked = (host, port) =>
  pyNet(`import socket\ns=socket.socket(); s.settimeout(2)\ntry:\n  s.connect(('${host}', ${port})); print('reachable')\nexcept Exception as e: print('blocked')`);
r = await blocked("169.254.169.254", 80);
check("cloud metadata endpoint blocked", r.stdout.trim() === "blocked", r);
r = await blocked("10.200.0.1", 22);
check("host services blocked", r.stdout.trim() === "blocked", r);

// Snapshots and pause keep memory, not just files: a background process must survive,
// and a 64 MiB buffer it holds must hash the same afterwards (catches bad diff merges).
await exec(a.id, "echo state > /root/state.txt; nohup sleep 3600 >/dev/null 2>&1 & echo $! > /root/bg.pid");
await api("PUT", `/v1/sandboxes/${a.id}/files?path=/root/memcheck.py`, new TextEncoder().encode(`
import hashlib, os, signal, time
def put(v):  # atomic, so the shell never reads a half-written file
    open('/root/mem.tmp', 'w').write(v); os.rename('/root/mem.tmp', '/root/mem.ok')
buf = bytearray(os.urandom(64 << 20))
want = hashlib.sha256(buf).hexdigest()
def check(*_):
    put('ok' if hashlib.sha256(buf).hexdigest() == want else 'CORRUPT')
def mutate(*_):
    global want
    buf[os.getpid() % len(buf)] ^= 0xFF; buf[-1] ^= 0x0F
    want = hashlib.sha256(buf).hexdigest(); put('mutated')
signal.signal(signal.SIGUSR1, check); signal.signal(signal.SIGUSR2, mutate)
open('/root/mem.ready', 'w').write('1')
while True: time.sleep(3600)
`));
await exec(a.id, "nohup python3 /root/memcheck.py >/dev/null 2>&1 & echo $! > /root/mem.pid; while [ ! -f /root/mem.ready ]; do sleep 0.05; done");
const memCheck = async (id) =>
  (await exec(id, "rm -f /root/mem.ok; kill -USR1 $(cat /root/mem.pid); while [ ! -f /root/mem.ok ]; do sleep 0.05; done; cat /root/mem.ok", { timeout_ms: 20000 })).stdout || "(no output)";
{ const v = await memCheck(a.id); check("memcheck control (no snapshot): hash matches", v === "ok", v); }
const mutate = (id) => exec(id, "rm -f /root/mem.ok; kill -USR2 $(cat /root/mem.pid); while [ ! -f /root/mem.ok ]; do sleep 0.05; done");
let t = now();
const snap = await api("POST", `/v1/sandboxes/${a.id}/snapshot`);
const snapMs = now() - t;
t = now();
const c = await api("POST", "/v1/sandboxes", { template: snap.name });
const fromSnapMs = now() - t;
r = await exec(c.id, "cat /root/state.txt; kill -0 $(cat /root/bg.pid) && echo alive");
{ const n = await exec(c.id, ["python3", "-c", "import urllib.request as u; print(u.urlopen('https://pypi.org/simple/', timeout=15).status)"], { timeout_ms: 30000 });
  check("internet works in a sandbox created from a snapshot", n.stdout.trim() === "200", n); }
check("create from snapshot keeps files + running processes", r.stdout === "state\nalive\n", r);
{ const v = await memCheck(c.id); check("create from snapshot: 64 MiB process memory intact", v === "ok", v); }
r = await exec(a.id, "echo still-original");
check("source sandbox keeps running after snapshot", r.stdout === "still-original\n", r);
console.log(`snapshot ${snapMs.toFixed(0)} ms, create-from-snapshot ${fromSnapMs.toFixed(0)} ms`);
await del(c.id);
await api("DELETE", `/v1/templates/${snap.name}`);

t = now();
await api("POST", `/v1/sandboxes/${a.id}/pause`);
const pauseMs = now() - t;
const st = await api("GET", `/v1/sandboxes/${a.id}`);
check("paused sandbox reports paused", st.state === "paused", st);
t = now();
r = await exec(a.id, "cat /root/state.txt; kill -0 $(cat /root/bg.pid) && echo alive");
const resumeExecMs = now() - t;
check("exec auto-resumes a paused sandbox with memory intact", r.stdout === "state\nalive\n", r);
{ const v = await memCheck(a.id); check("pause/resume: 64 MiB process memory intact", v === "ok", v); }
console.log(`pause ${pauseMs.toFixed(0)} ms, resume+exec ${resumeExecMs.toFixed(0)} ms`);
r = await pyNet("import urllib.request as u; print(u.urlopen('https://pypi.org/simple/', timeout=15).status)");
check("internet works after pause/resume (new network slot)", r.stdout.trim() === "200", r);
// Second cycle after mutating memory: exercises diff-on-top-of-rebased-base.
await mutate(a.id);
t = now();
await api("POST", `/v1/sandboxes/${a.id}/pause`);
const pause2Ms = now() - t;
await api("POST", `/v1/sandboxes/${a.id}/resume`);
{ const v = await memCheck(a.id); check("second pause/resume after mutation: memory intact", v === "ok", v); }
const snap2 = await api("POST", `/v1/sandboxes/${a.id}/snapshot`);
const d = await api("POST", "/v1/sandboxes", { template: snap2.name });
{ const v = await memCheck(d.id); check("snapshot after pause cycles: memory intact in the copy", v === "ok", v); }
await del(d.id);
await api("DELETE", `/v1/templates/${snap2.name}`);
console.log(`second pause ${pause2Ms.toFixed(0)} ms`);

// Preview URLs: HTTP proxied into a port inside the sandbox.
await api("PUT", `/v1/sandboxes/${a.id}/files?path=/workspace/site/index.html`, new TextEncoder().encode("preview-ok\n"));
await api("PUT", `/v1/sandboxes/${a.id}/files?path=/workspace/wait_port.py`, new TextEncoder().encode(
  "import socket,sys,time\nfor _ in range(200):\n  try: socket.create_connection(('127.0.0.1',int(sys.argv[1])),1); print('up'); break\n  except OSError: time.sleep(0.05)\nelse: print('down')\n"));
r = await exec(a.id, "cd /workspace/site && (setsid python3 -u -m http.server 3000 --bind 127.0.0.1 > /tmp/http.log 2>&1 < /dev/null &); python3 /workspace/wait_port.py 3000; cat /tmp/http.log; dmesg | tail -5; free -m | head -2");
console.log("preview server:", JSON.stringify(r.stdout));
let pr0 = await fetch(`${URL_}/v1/sandboxes/${a.id}/ports/3000/`, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} });
check("preview URL root (trailing slash) is routed", pr0.status === 200, { status: pr0.status });
let pr = await fetch(`${URL_}/v1/sandboxes/${a.id}/ports/3000/index.html?x=1`, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} });
let body = await pr.text();
check("preview URL proxies HTTP into the sandbox", pr.status === 200 && body.trim() === "preview-ok", { status: pr.status, body });
pr = await fetch(`${URL_}/v1/sandboxes/${a.id}/ports/3999`);
check("preview to a closed port is a 502", pr.status === 502, { status: pr.status });

// Labels, keys, default env.
const lb = await api("POST", "/v1/sandboxes", { template: TEMPLATE, key: "k-" + Date.now(), labels: { suite: "e2e", role: "x" }, env: { GREETING: "hi" } });
const found = await api("GET", "/v1/sandboxes?label.suite=e2e&label.role=x");
const none = await api("GET", "/v1/sandboxes?label.suite=other");
check("list filters by labels", found.length === 1 && found[0].id === lb.id && none.length === 0, { found, none });
const byKey = await api("GET", `/v1/sandboxes?key=${lb.key}`);
check("find by key", byKey.length === 1 && byKey[0].id === lb.id, byKey);
r = await exec(lb.id, "echo $GREETING; pwd; test -d /workspace && echo ws");
check("sandbox default env + /workspace exists", r.stdout === "hi\n/root\nws\n", r);
await del(lb.id);

r = await exec(a.id, "cat /proc/1/comm; uname -r; nproc");
console.log("guest:", r.stdout.trim().replace(/\n/g, " | "));

await Promise.all([del(a.id), del(b.id)]);
const list = await api("GET", "/v1/sandboxes");
check("delete removes sandboxes", list.length === 0, list);

// ---------- benchmarks ----------
const results = { template: TEMPLATE, samples: SAMPLES, burst: BURST, at: new Date().toISOString() };

// 1. Cold path every time: create -> first command -> delete, sequential.
const ttfc = [], createOnly = [], serverTotal = [], restore = [];
for (let i = 0; i < SAMPLES; i++) {
  const t0 = now();
  const s = await create();
  const t1 = now();
  await exec(s.id, "true");
  ttfc.push(now() - t0);
  createOnly.push(t1 - t0);
  serverTotal.push(s.timings.total_ms);
  restore.push(s.timings.restore_ms);
  await del(s.id);
}
results.create_ms = stats(createOnly);
results.create_to_first_exec_ms = stats(ttfc);
results.server_create_total_ms = stats(serverTotal);
results.server_restore_ms = stats(restore);

// 1b. Where does cold-path time go? Server-side phases + the first three execs.
const phases = { clone_disk_ms: [], spawn_vmm_ms: [], restore_ms: [], agent_ready_ms: [] };
const execN = [[], [], []];
for (let i = 0; i < Math.min(SAMPLES, 30); i++) {
  const x = await create();
  for (const k of Object.keys(phases)) phases[k].push(x.timings[k]);
  for (let j = 0; j < 3; j++) {
    const t = now();
    await exec(x.id, ["true"]);
    execN[j].push(now() - t);
  }
  await del(x.id);
}
results.profile = Object.fromEntries([
  ...Object.entries(phases).map(([k, v]) => [k, stats(v)]),
  ...execN.map((v, j) => [`exec_${j + 1}_after_restore_ms`, stats(v)]),
]);

// 2. Exec round trip on a live sandbox.
const s = await create();
const rtt = [];
for (let i = 0; i < SAMPLES * 2; i++) {
  const t0 = now();
  await exec(s.id, ["true"]);
  rtt.push(now() - t0);
}
results.exec_rtt_ms = stats(rtt);

// 3. Python startup inside a sandbox (realistic first-command cost), if python exists.
const py = await exec(s.id, "command -v python3 || true");
if (py.stdout.trim()) {
  const pyt = [];
  for (let i = 0; i < 20; i++) {
    const t0 = now();
    await exec(s.id, ["python3", "-c", "print(1)"]);
    pyt.push(now() - t0);
  }
  results.python_print_ms = stats(pyt);
}
// 4. File throughput.
const big = new Uint8Array(64 << 20);
let t0 = now();
await api("PUT", `/v1/sandboxes/${s.id}/files?path=/root/big`, big);
results.upload_64mib_ms = Math.round(now() - t0);
t0 = now();
await api("GET", `/v1/sandboxes/${s.id}/files?path=/root/big`, undefined, true);
results.download_64mib_ms = Math.round(now() - t0);
await del(s.id);

// 5. Concurrent burst: BURST creates at once, each runs a command.
async function burst(n) {
  const t0 = now();
  const runs = await Promise.all(
    Array.from({ length: n }, async () => {
      const t = now();
      const x = await create();
      const c = now() - t;
      await exec(x.id, "true");
      return { id: x.id, total: now() - t, create: c, timings: x.timings };
    }),
  );
  const wall = now() - t0;
  await Promise.all(runs.map((x) => del(x.id)));
  const ph = (k) => stats(runs.map((x) => x.timings[k]));
  return {
    wall_ms: Math.round(wall),
    create_to_first_exec_ms: stats(runs.map((x) => x.total)),
    create_ms: stats(runs.map((x) => x.create)),
    server: { spawn_vmm_ms: ph("spawn_vmm_ms"), restore_ms: ph("restore_ms"), agent_ready_ms: ph("agent_ready_ms") },
  };
}
results.burst = {};
for (const n of [2, 5, BURST]) results.burst[n] = await burst(n);

console.log(JSON.stringify(results, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}

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
t0 = now();
const per = await Promise.all(
  Array.from({ length: BURST }, async () => {
    const t = now();
    const x = await create();
    await exec(x.id, "true");
    const d = now() - t;
    await del(x.id);
    return d;
  }),
);
results.burst_wall_ms = Math.round(now() - t0);
results.burst_create_to_first_exec_ms = stats(per);

console.log(JSON.stringify(results, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}

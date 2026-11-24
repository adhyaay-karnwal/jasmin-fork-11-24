// End-to-end tests of the gateway's rules against a fake daemon.
// Run: node --test test/   (no dependencies needed)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { fakeDaemon } from "./fake-daemon.mjs";

const HOST_KEY = "host-secret";
const DPORT = 17171 + Math.floor(Math.random() * 500);
const GPORT = DPORT + 1000;
const G = `http://127.0.0.1:${GPORT}`;
const WHSEC = "whsec_test";
const daemon = fakeDaemon({ apiKey: HOST_KEY });
let gw;
const logs = [];

const KEYS = {
  alice: "jsm_alice_key_0000000000000000",
  bob: "jsm_bob_key_00000000000000000000",
  oss: "jsm_free_plan_key_0000000000000",
  carol: "jsm_carol_zero_cap_000000000000", // spend cap $0
  dave: "jsm_dave_tiny_cap_0000000000000", // spend cap $0.0005
  erin: "jsm_erin_upgrades_0000000000000", // becomes "cloud" through the Stripe webhook
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(who, method, path, body) {
  const r = await fetch(G + path, {
    method,
    headers: { ...(who ? { authorization: `Bearer ${KEYS[who] ?? who}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : undefined };
}

before(async () => {
  await new Promise((r) => daemon.listen(DPORT, "127.0.0.1", r));
  gw = spawn(process.execPath, ["src/server.mjs"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(GPORT),
      JASMINE_HOSTS: `h1=http://127.0.0.1:${DPORT}`,
      JASMINE_HOST_KEY: HOST_KEY,
      JASMINE_STORE: "memory",
      JASMINE_DEV_KEYS: [
        `${KEYS.alice}:alice`,
        `${KEYS.bob}:bob`,
        `${KEYS.oss}:oss:open-source`,
        `${KEYS.carol}:carol:cloud:0`,
        `${KEYS.dave}:dave:cloud:0.0005`,
        `${KEYS.erin}:erin:open-source`,
      ].join(","),
      LIMIT_RUNNING: "3",
      LIMIT_TOTAL: "5",
      LIMIT_SNAPSHOTS: "2",
      FREE_USD_PER_MONTH: "0",
      // $36 per vCPU-hour = 1 cent per vCPU-second, so spend shows up fast.
      RATE_VCPU_HOUR: "36",
      RATE_GIB_HOUR: "0",
      TIMEOUT_MIN_S: "1",
      METER_INTERVAL_MS: "200",
      FLUSH_INTERVAL_MS: "400",
      STRIPE_WEBHOOK_SECRET: WHSEC,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  gw.stdout.on("data", (d) => logs.push(String(d)));
  gw.stderr.on("data", (d) => logs.push(String(d)));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${G}/healthz`)).ok) return;
    } catch {}
    await sleep(50);
  }
  throw new Error(`gateway did not start:\n${logs.join("")}`);
});

after(() => {
  gw?.kill();
  daemon.close();
});

test("rejects missing, unknown and non-Cloud keys", async () => {
  assert.equal((await req(null, "GET", "/v1/sandboxes")).status, 401);
  assert.equal((await req("jsm_not_a_real_key", "GET", "/v1/sandboxes")).status, 401);
  const r = await req("oss", "GET", "/v1/sandboxes");
  assert.equal(r.status, 402);
  assert.match(r.body.error, /not enabled/);
});

test("sandboxes are private to their owner", async () => {
  const c = await req("alice", "POST", "/v1/sandboxes", { labels: { team: "x", "jasmine.owner": "bob" }, key: "job-1" });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const id = c.body.id;
  assert.deepEqual(c.body.labels, { team: "x" }, "reserved labels are hidden and can't be set");
  assert.equal(c.body.key, "job-1");
  assert.ok(c.body.timeout_at > Date.now() / 1000);
  assert.equal(daemon.sandboxes.get(id).labels["jasmine.owner"], "alice");

  for (const [m, p] of [["GET", ""], ["DELETE", ""], ["POST", "/exec"], ["POST", "/pause"], ["POST", "/snapshot"], ["GET", "/files?path=/etc/passwd"]]) {
    assert.equal((await req("bob", m, `/v1/sandboxes/${id}${p}`, m === "POST" ? { cmd: "id" } : undefined)).status, 404, `${m} ${p}`);
  }
  assert.deepEqual((await req("bob", "GET", "/v1/sandboxes")).body, []);
  assert.deepEqual((await req("bob", "GET", "/v1/sandboxes?label.jasmine.owner=alice")).body, []);
  const mine = (await req("alice", "GET", "/v1/sandboxes")).body;
  assert.deepEqual(mine.map((s) => s.id), [id]);
  assert.equal((await req("alice", "GET", "/v1/sandboxes?key=job-1")).body[0].id, id);

  // Keys are per account: bob may reuse alice's key, alice may not reuse her own.
  const b = await req("bob", "POST", "/v1/sandboxes", { key: "job-1" });
  assert.equal(b.status, 201);
  assert.equal((await req("alice", "POST", "/v1/sandboxes", { key: "job-1" })).status, 409);

  const e = await req("alice", "POST", `/v1/sandboxes/${id}/exec`, { cmd: "echo hi" });
  assert.equal(e.status, 200);
  assert.equal(e.body.stdout, 'ran "echo hi"');
  assert.ok(!daemon.requests.some((r) => r.includes("/v1/templates") && r.startsWith("POST")));

  await req("alice", "DELETE", `/v1/sandboxes/${id}`);
  await req("bob", "DELETE", `/v1/sandboxes/${b.body.id}`);
  assert.equal(daemon.sandboxes.size, 0);
});

test("running and total limits, and resume counts toward them", async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await req("alice", "POST", "/v1/sandboxes", {})).body.id);
  const over = await req("alice", "POST", "/v1/sandboxes", {});
  assert.equal(over.status, 429);
  assert.match(over.body.error, /3 running/);
  assert.equal((await req("alice", "POST", `/v1/sandboxes/${ids[0]}/pause`)).status, 204);
  const fourth = await req("alice", "POST", "/v1/sandboxes", {});
  assert.equal(fourth.status, 201);
  assert.equal((await req("alice", "POST", `/v1/sandboxes/${ids[0]}/resume`)).status, 429, "resume needs a free running slot");
  assert.equal((await req("alice", "POST", `/v1/sandboxes/${ids[0]}/exec`, { cmd: "true" })).status, 429, "exec on a paused sandbox resumes it");
  for (const id of [...ids, fourth.body.id]) await req("alice", "DELETE", `/v1/sandboxes/${id}`);
});

test("oversized templates and template builds are refused", async () => {
  const big = await req("alice", "POST", "/v1/sandboxes", { template: "big" });
  assert.equal(big.status, 400);
  assert.equal(daemon.sandboxes.size, 0, "the oversized sandbox was removed");
  assert.equal((await req("alice", "POST", "/v1/sandboxes", { cpu: 64, memory_mib: 1024 })).status, 400);
  assert.equal((await req("alice", "POST", "/v1/templates", { name: "x", image: "alpine" })).status, 403);
  assert.equal((await req("alice", "DELETE", "/v1/templates/default")).status, 403);
});

test("snapshots belong to whoever took them", async () => {
  const s = (await req("alice", "POST", "/v1/sandboxes", {})).body;
  const snap = await req("alice", "POST", `/v1/sandboxes/${s.id}/snapshot`);
  assert.equal(snap.status, 201);
  const name = snap.body.name;
  assert.equal(snap.body.source_sandbox, undefined);
  assert.equal((await req("bob", "POST", "/v1/sandboxes", { template: name })).status, 404);
  assert.equal((await req("bob", "GET", `/v1/templates/${name}`)).status, 404);
  assert.equal((await req("bob", "DELETE", `/v1/templates/${name}`)).status, 404);
  assert.ok(!(await req("bob", "GET", "/v1/templates")).body.some((t) => t.name === name));
  assert.ok((await req("alice", "GET", "/v1/templates")).body.some((t) => t.name === name));
  const fork = await req("alice", "POST", "/v1/sandboxes", { template: name });
  assert.equal(fork.status, 201);
  // Snapshot limit is 2.
  await req("alice", "POST", `/v1/sandboxes/${s.id}/snapshot`);
  assert.equal((await req("alice", "POST", `/v1/sandboxes/${s.id}/snapshot`)).status, 429);
  assert.equal((await req("alice", "DELETE", `/v1/templates/${name}`)).status, 204);
  assert.equal((await req("alice", "POST", "/v1/sandboxes", { template: name })).status, 404);
  await req("alice", "DELETE", `/v1/sandboxes/${s.id}`);
  await req("alice", "DELETE", `/v1/sandboxes/${fork.body.id}`);
});

test("sandboxes time out (delete or pause)", async () => {
  const d = (await req("bob", "POST", "/v1/sandboxes", { timeout: 1 })).body;
  const p = (await req("bob", "POST", "/v1/sandboxes", { timeout: 1, on_timeout: "pause" })).body;
  await sleep(1800);
  assert.equal(daemon.sandboxes.has(d.id), false, "timed-out sandbox deleted");
  assert.equal(daemon.sandboxes.get(p.id)?.state, "paused", "on_timeout=pause keeps it, paused");
  await req("bob", "DELETE", `/v1/sandboxes/${p.id}`);
});

test("usage is metered and shown on /v1/me", async () => {
  const s = (await req("bob", "POST", "/v1/sandboxes", {})).body; // 2 vCPU at 1 cent per vCPU-second
  await sleep(1200);
  const me = (await req("bob", "GET", "/v1/me")).body;
  assert.ok(me.month.cpuS > 1, JSON.stringify(me.month));
  assert.ok(me.month.usd > 0.01 && me.month.usd < 0.2, `usd ${me.month.usd}`);
  assert.equal(me.sandboxes.running, 1);
  await req("bob", "DELETE", `/v1/sandboxes/${s.id}`);
});

test("spend cap blocks new compute and pauses running sandboxes", async () => {
  const r = await req("carol", "POST", "/v1/sandboxes", {});
  assert.equal(r.status, 402);
  assert.match(r.body.error, /spend limit/);
  const s = await req("dave", "POST", "/v1/sandboxes", {});
  assert.equal(s.status, 201);
  await sleep(1000);
  assert.equal(daemon.sandboxes.get(s.body.id).state, "paused", "capped account's sandbox is paused, not deleted");
  assert.equal((await req("dave", "POST", `/v1/sandboxes/${s.body.id}/resume`)).status, 402);
  await req("dave", "DELETE", `/v1/sandboxes/${s.body.id}`);
});

test("Stripe webhook turns Cloud on, and rejects bad signatures", async () => {
  const ev = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: "erin", customer: "cus_1", subscription: "sub_1" } } });
  const bad = await fetch(`${G}/billing/webhook`, { method: "POST", headers: { "stripe-signature": "t=1,v1=00" }, body: ev });
  assert.equal(bad.status, 400);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WHSEC).update(`${t}.${ev}`).digest("hex");
  const ok = await fetch(`${G}/billing/webhook`, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: ev });
  assert.equal(ok.status, 200);
  const r = await req("erin", "POST", "/v1/sandboxes", {});
  assert.equal(r.status, 201);
  await req("erin", "DELETE", `/v1/sandboxes/${r.body.id}`);
});

test("billing endpoints need a signed-in user", async () => {
  assert.equal((await fetch(`${G}/billing/checkout`, { method: "POST" })).status, 401);
  const r = await fetch(`${G}/billing/checkout`, { method: "POST", headers: { authorization: "Bearer dev:bob:bob@example.com" } });
  assert.equal(r.status, 503, "billing not configured in tests");
  const u = await fetch(`${G}/billing/usage`, { headers: { authorization: "Bearer dev:bob:bob@example.com" } });
  assert.equal(u.status, 200);
});

test("previews are public by sandbox ID, never wake a paused sandbox, and drop the caller's key", async () => {
  const s = (await req("alice", "POST", "/v1/sandboxes", {})).body;
  const r = await fetch(`${G}/v1/sandboxes/${s.id}/ports/3000/app.js?x=1`, { headers: { authorization: `Bearer ${KEYS.bob}` } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).preview, `/v1/sandboxes/${s.id}/ports/3000/app.js`);
  assert.equal((await fetch(`${G}/v1/sandboxes/sbx_doesnotexist/ports/3000/`)).status, 404);
  await req("alice", "POST", `/v1/sandboxes/${s.id}/pause`);
  assert.equal((await fetch(`${G}/v1/sandboxes/${s.id}/ports/3000/`)).status, 409);
  assert.equal(daemon.sandboxes.get(s.id).state, "paused");
  await req("alice", "DELETE", `/v1/sandboxes/${s.id}`);
});

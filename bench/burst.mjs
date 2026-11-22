#!/usr/bin/env node
// Concurrency probe: N simultaneous create -> first exec, per template.
//   node bench/burst.mjs <template> [n1 n2 ...]
const U = process.env.AZAMI_URL ?? "http://127.0.0.1:7171";
const j = { "content-type": "application/json" };
const post = (p, b) => fetch(U + p, { method: "POST", headers: j, body: JSON.stringify(b) }).then((r) => r.json());
const [template, ...ns] = process.argv.slice(2);
const p50 = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(1);
for (const n of ns.length ? ns.map(Number) : [1, 2, 5, 10]) {
  for (let rep = 0; rep < 3; rep++) {
    const t0 = performance.now();
    const runs = await Promise.all(Array.from({ length: n }, async () => {
      const t = performance.now();
      const x = await post("/v1/sandboxes", { template });
      await post(`/v1/sandboxes/${x.id}/exec`, { cmd: ["true"] });
      return { id: x.id, total: performance.now() - t, ...x.timings };
    }));
    const wall = performance.now() - t0;
    await Promise.all(runs.map((x) => fetch(`${U}/v1/sandboxes/${x.id}`, { method: "DELETE" })));
    if (rep === 2)
      console.log(`${template.padEnd(10)} n=${String(n).padStart(2)} wall=${wall.toFixed(0).padStart(5)}ms  e2e p50=${p50(runs.map((x) => x.total)).padStart(7)}  restore=${p50(runs.map((x) => x.restore_ms)).padStart(6)}  agent=${p50(runs.map((x) => x.agent_ready_ms)).padStart(6)}`);
  }
}

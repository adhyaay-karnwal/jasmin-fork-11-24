// A stand-in for jasmined's HTTP API (same routes and JSON shapes), so the
// gateway's rules can be tested on any machine. The real daemon is exercised
// in CI by .github/workflows/cloud.yml.

import http from "node:http";
import { randomBytes } from "node:crypto";

export function fakeDaemon({ apiKey = "", templates = [{ name: "default", vcpus: 2, mem_mib: 1024 }, { name: "big", vcpus: 16, mem_mib: 32768 }] } = {}) {
  const sbx = new Map();
  const tpl = new Map(templates.map((t) => [t.name, { image: "python:3.12-slim", prewarm_mib: 256, rootfs_bytes: 1, boot_ms: 1, built_unix: 1, ...t }]));
  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const info = (s) => ({ id: s.id, template: s.template, created_unix: s.created_unix, vcpus: s.vcpus, mem_mib: s.mem_mib, key: s.key, labels: s.labels, state: s.state });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://d");
    if (apiKey && req.headers.authorization !== `Bearer ${apiKey}` && url.pathname !== "/healthz") return json(res, 401, { error: "missing or invalid API key" });
    let body = "";
    for await (const c of req) body += c;
    const b = body ? JSON.parse(body) : {};
    const p = url.pathname.split("/").filter(Boolean);
    server.requests.push(`${req.method} ${url.pathname}`);
    if (p[1] === "templates" && p.length === 2) return json(res, 200, [...tpl.values()]);
    if (p[1] === "templates" && p.length === 3) {
      const t = tpl.get(p[2]);
      if (req.method === "DELETE") return tpl.delete(p[2]) ? json(res, 204) : json(res, 404, { error: "template not found" });
      return t ? json(res, 200, t) : json(res, 404, { error: "template not found" });
    }
    if (p[1] === "sandboxes" && p.length === 2 && req.method === "POST") {
      const t = tpl.get(b.template ?? "default");
      if (!t) return json(res, 404, { error: `template ${JSON.stringify(b.template)} not found` });
      if (b.key && [...sbx.values()].some((s) => s.key === b.key)) return json(res, 409, { error: `a sandbox with key ${JSON.stringify(b.key)} already exists` });
      const s = { id: `sbx_${randomBytes(8).toString("hex")}`, template: t.name, created_unix: Math.floor(Date.now() / 1000), vcpus: t.vcpus, mem_mib: t.mem_mib, key: b.key, labels: b.labels ?? {}, state: "running" };
      sbx.set(s.id, s);
      return json(res, 201, { ...info(s), timings: { total_ms: 90 } });
    }
    if (p[1] === "sandboxes" && p.length === 2) {
      const labels = [...url.searchParams].filter(([k]) => k.startsWith("label.")).map(([k, v]) => [k.slice(6), v]);
      const key = url.searchParams.get("key");
      return json(res, 200, [...sbx.values()].filter((s) => labels.every(([k, v]) => s.labels[k] === v) && (!key || s.key === key)).map(info));
    }
    const s = sbx.get(p[2]);
    if (!s) return json(res, 404, { error: "sandbox not found" });
    const rest = p[3];
    if (!rest && req.method === "GET") return json(res, 200, info(s));
    if (!rest && req.method === "DELETE") return sbx.delete(s.id), json(res, 204);
    if (rest === "pause") return (s.state = "paused"), json(res, 204);
    if (rest === "resume") return (s.state = "running"), json(res, 200, { restore_ms: 5 });
    if (rest === "exec") return (s.state = "running"), json(res, 200, { exit_code: 0, stdout: `ran ${JSON.stringify(b.cmd)}`, stderr: "" });
    if (rest === "snapshot") {
      const name = `snap_${randomBytes(6).toString("hex")}`;
      tpl.set(name, { ...tpl.get(s.template), name, source_sandbox: s.id });
      s.state = "running";
      return json(res, 201, tpl.get(name));
    }
    if (rest === "ports") return json(res, 200, { preview: url.pathname });
    return json(res, 404, { error: "not found" });
  });
  server.requests = [];
  server.sandboxes = sbx;
  return server;
}

// Jasmine through jasmined's REST API on localhost (same host as every other system).
import http from "node:http";

const BASE = new URL(process.env.JASMINE_URL ?? "http://127.0.0.1:7171");
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

function request(method, path, body, { raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(JSON.stringify(body));
    const headers = payload ? { "content-type": body instanceof Uint8Array ? "application/octet-stream" : "application/json", "content-length": payload.length } : {};
    if (process.env.JASMINE_API_KEY) headers.authorization = `Bearer ${process.env.JASMINE_API_KEY}`;
    const req = http.request({ host: BASE.hostname, port: BASE.port, method, path, agent, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode >= 400) return reject(new Error(`jasmine ${method} ${path}: ${res.statusCode} ${buf.toString().slice(0, 300)}`));
        if (raw) return resolve(new Uint8Array(buf));
        resolve(buf.length ? JSON.parse(buf.toString()) : null);
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export function jasmineSystem({ name = "jasmine", template = "fair" } = {}) {
  return {
    name,
    isolation: "microVM (Firecracker)",
    async available() {
      await request("GET", "/healthz", undefined, { raw: true });
      return true;
    },
    async create({ cpu, memoryMb }) {
      const s = await request("POST", "/v1/sandboxes", { template, cpu, memory_mib: memoryMb });
      return { id: s.id };
    },
    async exec(h, cmd, { timeoutMs = 600_000 } = {}) {
      const r = await request("POST", `/v1/sandboxes/${h.id}/exec`, { cmd, cwd: "/workspace", timeout_ms: timeoutMs });
      return { exitCode: r.exit_code, stdout: r.stdout, stderr: r.stderr };
    },
    writeFile: (h, path, data) => request("PUT", `/v1/sandboxes/${h.id}/files?path=${encodeURIComponent(path)}`, data),
    readFile: (h, path) => request("GET", `/v1/sandboxes/${h.id}/files?path=${encodeURIComponent(path)}`, undefined, { raw: true }),
    destroy: (h) => request("DELETE", `/v1/sandboxes/${h.id}`),
  };
}

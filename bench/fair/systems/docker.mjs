// Docker Engine API over its unix socket (no CLI process per call, so Docker
// pays no CLI start-up cost). Covers three systems via OCI runtimes:
// runc (containers), runsc (gVisor) and kata (Kata Containers microVMs).
import http from "node:http";
import { posix } from "node:path";
import { tarOne, untarFirst } from "../lib/tar.mjs";

const SOCK = process.env.DOCKER_SOCK ?? "/var/run/docker.sock";
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

function request(method, path, body, { raw = false, contentType = "application/json" } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const req = http.request(
      { socketPath: SOCK, method, path: `/v1.43${path}`, agent, headers: payload ? { "content-type": contentType, "content-length": payload.length } : {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode >= 400) return reject(new Error(`docker ${method} ${path}: ${res.statusCode} ${buf.toString().slice(0, 300)}`));
          if (raw) return resolve(buf);
          resolve(buf.length ? JSON.parse(buf.toString()) : null);
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Demultiplex Docker's attach stream: [type, 0,0,0, size u32 BE, payload].
function demux(buf) {
  let stdout = "", stderr = "", off = 0;
  while (off + 8 <= buf.length) {
    const type = buf[off], size = buf.readUInt32BE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + size).toString();
    if (type === 2) stderr += chunk;
    else stdout += chunk;
    off += 8 + size;
  }
  return { stdout, stderr };
}

export function dockerSystem({ name, runtime, isolation }) {
  return {
    name,
    isolation,
    async available() {
      const info = await request("GET", "/info");
      if (!Object.keys(info.Runtimes ?? {}).includes(runtime)) throw new Error(`docker runtime ${runtime} not installed`);
      return true;
    },
    async create({ image, cpu, memoryMb }) {
      const c = await request("POST", "/containers/create", {
        Image: image,
        Cmd: ["sleep", "infinity"],
        WorkingDir: "/workspace",
        Tty: false,
        HostConfig: { Runtime: runtime, NanoCpus: cpu * 1e9, Memory: memoryMb * 2 ** 20, MemorySwap: memoryMb * 2 ** 20 },
      });
      await request("POST", `/containers/${c.Id}/start`);
      return { id: c.Id };
    },
    async exec(h, cmd, { timeoutMs = 600_000 } = {}) {
      const e = await request("POST", `/containers/${h.id}/exec`, {
        Cmd: ["timeout", "-k", "1", String(Math.ceil(timeoutMs / 1000)), "sh", "-c", cmd],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: "/workspace",
      });
      const out = await request("POST", `/exec/${e.Id}/start`, { Detach: false, Tty: false }, { raw: true });
      const st = await request("GET", `/exec/${e.Id}/json`);
      return { exitCode: st.ExitCode, ...demux(out) };
    },
    async writeFile(h, path, data) {
      // Upload at "/" with the full path as the entry name: extraction creates
      // missing parent directories, so no extra exec is charged to Docker.
      await request("PUT", `/containers/${h.id}/archive?path=%2F`, tarOne(posix.normalize(path).replace(/^\/+/, ""), data), {
        contentType: "application/x-tar",
      });
    },
    async readFile(h, path) {
      return untarFirst(await request("GET", `/containers/${h.id}/archive?path=${encodeURIComponent(path)}`, undefined, { raw: true }));
    },
    async destroy(h) {
      await request("DELETE", `/containers/${h.id}?force=true&v=true`);
    },
    /** Host-side PIDs of everything belonging to this sandbox, for memory accounting. */
    async hostPids(h) {
      const c = await request("GET", `/containers/${h.id}/json`);
      return [c.State.Pid];
    },
  };
}

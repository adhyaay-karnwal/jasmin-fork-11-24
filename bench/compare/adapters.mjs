// One thin adapter per provider, using each provider's official SDK with its
// documented defaults. Adapters must not tune anything a normal user would not.
// Interface: { name, available(), endpoint, create() -> handle, exec(h, cmd) -> {exitCode, stdout},
//              write(h, path, bytes), read(h, path) -> bytes, destroy(h) }

import { Warren } from "../../sdk/typescript/dist/index.js";

export const adapters = {
  warren: {
    name: "warren",
    available: () => true,
    endpoint: () => process.env.WARREN_URL ?? "http://127.0.0.1:7171",
    isolation: "Firecracker microVM",
    async init() {
      this.client = new Warren();
    },
    create() {
      return this.client.create({ template: process.env.WARREN_TEMPLATE ?? "default" });
    },
    async exec(s, cmd) {
      const r = await s.exec(cmd, { timeoutMs: 600_000 });
      return { exitCode: r.exitCode, stdout: r.stdout };
    },
    write: (s, path, data) => s.files.write(path, data),
    read: (s, path) => s.files.read(path),
    destroy: (s) => s.delete(),
  },

  e2b: {
    name: "e2b",
    available: () => !!process.env.E2B_API_KEY,
    endpoint: () => "https://api.e2b.app",
    isolation: "Firecracker microVM",
    async init() {
      this.Sandbox = (await import("e2b")).Sandbox;
    },
    create() {
      return this.Sandbox.create(); // default template
    },
    async exec(s, cmd) {
      try {
        const r = await s.commands.run(cmd, { timeoutMs: 600_000 });
        return { exitCode: r.exitCode, stdout: r.stdout };
      } catch (e) {
        // The SDK throws on non-zero exit; normalise.
        if (e && typeof e.exitCode === "number") return { exitCode: e.exitCode, stdout: e.stdout ?? "" };
        throw e;
      }
    },
    write: (s, path, data) => s.files.write(path, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
    async read(s, path) {
      return new Uint8Array(await s.files.read(path, { format: "bytes" }));
    },
    destroy: (s) => s.kill(),
  },

  daytona: {
    name: "daytona",
    available: () => !!process.env.DAYTONA_API_KEY,
    endpoint: () => process.env.DAYTONA_API_URL ?? "https://app.daytona.io/api",
    isolation: "container (per Daytona docs)",
    async init() {
      const { Daytona } = await import("@daytonaio/sdk");
      this.client = new Daytona();
    },
    create() {
      return this.client.create({ language: "python" });
    },
    async exec(s, cmd) {
      const r = await s.process.executeCommand(cmd, undefined, undefined, 600);
      return { exitCode: r.exitCode, stdout: r.result };
    },
    write: (s, path, data) => s.fs.uploadFile(Buffer.from(data), path),
    async read(s, path) {
      return new Uint8Array(await s.fs.downloadFile(path));
    },
    destroy: (s) => s.delete(),
  },
};

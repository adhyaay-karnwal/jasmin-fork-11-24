// Azami adapter for @opencoredev/sandbox-sdk: a thin REST client for azamid.
// Lives in the Azami repo; integrations/sandbox-sdk/apply.py copies it into a
// sandbox-sdk checkout as packages/sdk/src/providers/azami.

import {
  SandboxError,
  type CreateInput,
  type ErrorCode,
  type ExecInput,
  type ExecResult,
  type FileInfo,
  type Labels,
  type Preview,
  type Provider,
  type ProviderFiles,
  type SandboxInfo,
} from "../../provider.js";

export type AzamiCapability = "pause" | "snapshot" | "snapshot-delete" | "size";

export interface AzamiOptions {
  /** azamid base URL. Defaults to $AZAMI_URL, then http://127.0.0.1:7171. */
  url?: string;
  /** Bearer token. Defaults to $AZAMI_API_KEY. */
  apiKey?: string;
  /** Template for new sandboxes (a size request picks `<template>-<cpu>x<mem>`). */
  template?: string;
  fetch?: typeof fetch;
  [option: string]: unknown;
}

export interface AzamiNative {
  id: string;
  url: string;
}

export type AzamiProvider = Provider<AzamiNative, AzamiCapability>;

interface WireSandbox {
  id: string;
  key?: string;
  labels?: Labels;
  state?: "running" | "paused";
  created_unix: number;
}

const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];

const presets = { small: { cpu: 1, memoryMb: 1024 }, medium: { cpu: 2, memoryMb: 4096 }, large: { cpu: 4, memoryMb: 8192 } } as const;

export function createAzamiProvider(options: AzamiOptions = {}): AzamiProvider {
  const base = (options.url ?? env("AZAMI_URL") ?? "http://127.0.0.1:7171").replace(/\/$/, "");
  const apiKey = options.apiKey ?? env("AZAMI_API_KEY");
  const template = options.template ?? env("AZAMI_TEMPLATE") ?? "default";
  const doFetch = options.fetch ?? fetch;
  const auth: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};

  const fail = (message: string, code: ErrorCode, extra: { sandboxId?: string; retryable?: boolean; cause?: unknown } = {}) =>
    new SandboxError(message, { code, provider: "azami", ...extra });

  async function call(method: string, path: string, body?: unknown, opts: { raw?: boolean; signal?: AbortSignal; sandboxId?: string } = {}) {
    const headers: Record<string, string> = { ...auth };
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) payload = body as unknown as BodyInit;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await doFetch(base + path, { method, headers, body: payload, signal: opts.signal });
    } catch (cause) {
      if (opts.signal?.aborted) throw fail("Request aborted", "aborted", { cause, sandboxId: opts.sandboxId });
      const why = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
      throw fail(`azamid unreachable at ${base} (${method} ${path}): ${why}`, "unavailable", { cause, retryable: true, sandboxId: opts.sandboxId });
    }
    if (!res.ok) {
      let msg = await res.text();
      try {
        msg = (JSON.parse(msg) as { error?: string }).error ?? msg;
      } catch {}
      const code: ErrorCode =
        res.status === 401 || res.status === 403 ? "auth" : res.status === 404 ? "not_found" : res.status === 409 ? "invalid_argument" : "provider";
      const err = fail(`${method} ${path}: ${msg}`, code, { sandboxId: opts.sandboxId, retryable: res.status >= 500 });
      Object.assign(err, { status: res.status });
      throw err;
    }
    if (res.status === 204) return undefined;
    return opts.raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
  }

  const info = (w: WireSandbox): SandboxInfo => ({
    id: w.id,
    ...(w.key ? { key: w.key } : {}),
    labels: w.labels ?? {},
    state: w.state ?? "running",
    createdAt: w.created_unix * 1000,
  });

  const sb = (id: string) => `/v1/sandboxes/${encodeURIComponent(id)}`;
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

  async function run(id: string, command: string, timeoutMs = 60_000): Promise<{ exit_code: number | null; stdout: string; stderr: string; timed_out: boolean }> {
    return call("POST", `${sb(id)}/exec`, { cmd: command, timeout_ms: timeoutMs }, { sandboxId: id });
  }

  // File metadata through one small python3 program (present in every bench image).
  const META = `import json,os,stat,sys
def info(p):
  s=os.lstat(p); m=s.st_mode
  t='symlink' if stat.S_ISLNK(m) else 'directory' if stat.S_ISDIR(m) else 'file'
  return {'path':p,'type':t,'size':s.st_size,'modifiedAt':int(s.st_mtime*1000)}
op,p=sys.argv[1],sys.argv[2]
try:
  if op=='stat': print(json.dumps(info(p)))
  else: print(json.dumps([info(os.path.join(p,n)) for n in sorted(os.listdir(p))]))
except FileNotFoundError: print('AZAMI_NOT_FOUND')`;

  async function meta(id: string, op: "stat" | "list", path: string): Promise<unknown> {
    const r = await run(id, `python3 -c ${q(META)} ${op} ${q(path)}`);
    if (r.stdout.trim() === "AZAMI_NOT_FOUND") throw fail(`no such file: ${path}`, "file_not_found", { sandboxId: id });
    if (r.exit_code !== 0) throw fail(`${op} ${path}: ${r.stderr.trim()}`, "provider", { sandboxId: id });
    return JSON.parse(r.stdout);
  }

  const files: ProviderFiles = {
    writeCreatesParents: true,
    writeSupportsMode: true,
    listOrder: "name",
    async read(id, path) {
      try {
        return (await call("GET", `${sb(id)}/files?path=${encodeURIComponent(path)}`, undefined, { raw: true, sandboxId: id })) as Uint8Array;
      } catch (e) {
        if (e instanceof SandboxError && e.code === "not_found" && (await call("GET", sb(id)).then(() => true, () => false)))
          throw fail(`no such file: ${path}`, "file_not_found", { sandboxId: id });
        throw e;
      }
    },
    async write(id, path, data, opts) {
      const mode = opts?.mode !== undefined ? `&mode=${opts.mode.toString(8)}` : "";
      await call("PUT", `${sb(id)}/files?path=${encodeURIComponent(path)}${mode}`, data, { sandboxId: id });
    },
    list: async (id, path) => (await meta(id, "list", path)) as FileInfo[],
    stat: async (id, path) => (await meta(id, "stat", path)) as FileInfo,
    async remove(id, path, opts) {
      const r = await run(id, `test -e ${q(path)} || test -L ${q(path)} || { echo AZAMI_NOT_FOUND; exit 0; }; rm ${opts.recursive ? "-rf" : "-f"} ${q(path)} 2>&1 || rmdir ${q(path)}`);
      if (r.stdout.trim() === "AZAMI_NOT_FOUND") throw fail(`no such file: ${path}`, "file_not_found", { sandboxId: id });
      if (r.exit_code !== 0) throw fail(`remove ${path}: ${r.stdout}${r.stderr}`, "provider", { sandboxId: id });
    },
    async mkdir(id, path) {
      const r = await run(id, `mkdir -p ${q(path)}`);
      if (r.exit_code !== 0) throw fail(`mkdir ${path}: ${r.stderr}`, "provider", { sandboxId: id });
    },
  };

  const provider: AzamiProvider = {
    name: "azami",
    keyMode: "exact",
    capabilities: new Set<AzamiCapability>(["pause", "snapshot", "snapshot-delete", "size"]),

    async create(input: CreateInput) {
      const size = typeof input.size === "string" ? presets[input.size] : input.size;
      const w = (await call(
        "POST",
        "/v1/sandboxes",
        {
          template: input.from ?? template,
          key: input.key,
          labels: input.labels,
          env: input.env ?? {},
          ...(size ? { cpu: size.cpu, memory_mib: size.memoryMb } : {}),
        },
        { signal: input.signal },
      )) as WireSandbox;
      return info({ ...w, state: "running" });
    },

    async find(key) {
      const xs = (await call("GET", `/v1/sandboxes?key=${encodeURIComponent(key)}`)) as WireSandbox[];
      return xs[0] ? info(xs[0]) : undefined;
    },

    async connect(id) {
      return info((await call("GET", sb(id), undefined, { sandboxId: id })) as WireSandbox);
    },

    async list(labels) {
      const qs = Object.entries(labels)
        .map(([k, v]) => `label.${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      return ((await call("GET", `/v1/sandboxes${qs ? `?${qs}` : ""}`)) as WireSandbox[]).map(info);
    },

    async destroy(id) {
      try {
        await call("DELETE", sb(id), undefined, { sandboxId: id });
      } catch (e) {
        if (!(e instanceof SandboxError && e.code === "not_found")) throw e;
      }
    },

    async exec(id, input: ExecInput): Promise<ExecResult> {
      const r = (await call(
        "POST",
        `${sb(id)}/exec`,
        { cmd: input.command, cwd: input.cwd, env: input.env, timeout_ms: input.timeoutMs, stdin: input.stdin ?? "" },
        { signal: input.signal, sandboxId: id },
      )) as { exit_code: number | null; timed_out: boolean; stdout: string; stderr: string };
      if (r.stdout) input.onChunk({ stream: "stdout", text: r.stdout });
      if (r.stderr) input.onChunk({ stream: "stderr", text: r.stderr });
      return { exitCode: r.timed_out ? null : r.exit_code, timedOut: r.timed_out };
    },

    files,

    async previewUrl(id, port): Promise<Preview> {
      return { url: `${base}${sb(id)}/ports/${port}`, headers: { ...auth } };
    },

    native: (id) => ({ id, url: `${base}${sb(id)}` }),

    async pause(id) {
      await call("POST", `${sb(id)}/pause`, undefined, { sandboxId: id });
    },
    async resume(id) {
      await call("POST", `${sb(id)}/resume`, undefined, { sandboxId: id });
    },
    async snapshot(id) {
      const t = (await call("POST", `${sb(id)}/snapshot`, undefined, { sandboxId: id })) as { name: string };
      return { id: t.name };
    },
    async deleteSnapshot(snapshotId) {
      try {
        await call("DELETE", `/v1/templates/${encodeURIComponent(snapshotId)}`);
        return true;
      } catch (e) {
        if (e instanceof SandboxError && e.code === "not_found") return false;
        throw e;
      }
    },
  };
  return provider;
}

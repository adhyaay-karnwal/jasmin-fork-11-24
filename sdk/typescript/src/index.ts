/**
 * Warren TypeScript SDK. Zero dependencies; works in Node 18+, Bun, Deno and edge runtimes.
 *
 * ```ts
 * import { Warren } from "@warren/sdk";
 * const warren = new Warren({ url: "http://127.0.0.1:7171" });
 * await using sbx = await warren.create();      // deleted when it goes out of scope
 * const r = await sbx.exec("python3 -c 'print(6*7)'");
 * console.log(r.stdout);                          // "42\n"
 * ```
 */

export interface WarrenOptions {
  /** Defaults to $WARREN_URL or http://127.0.0.1:7171. */
  url?: string;
  /** Defaults to $WARREN_API_KEY. */
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface ExecOptions {
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
}

export interface ExecResult {
  exitCode: number | null;
  signal: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
}

export interface CreateTimings {
  clone_disk_ms: number;
  reflink: boolean;
  spawn_vmm_ms: number;
  restore_ms: number;
  agent_ready_ms: number;
  total_ms: number;
}

export interface TemplateInfo {
  name: string;
  image: string;
  vcpus: number;
  mem_mib: number;
  prewarm_mib: number;
  rootfs_bytes: number;
  boot_ms: number;
  built_unix: number;
}

export class WarrenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WarrenError";
  }
}

const env = (k: string): string | undefined => (globalThis as any).process?.env?.[k];

export class Warren {
  readonly url: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WarrenOptions = {}) {
    this.url = (opts.url ?? env("WARREN_URL") ?? "http://127.0.0.1:7171").replace(/\/$/, "");
    this.apiKey = opts.apiKey ?? env("WARREN_API_KEY");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** @internal */
  async request(method: string, path: string, body?: unknown, raw = false): Promise<any> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) payload = body as unknown as BodyInit;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await this.fetchImpl(this.url + path, { method, headers, body: payload });
    if (!res.ok) {
      let msg = await res.text();
      try {
        msg = JSON.parse(msg).error ?? msg;
      } catch {}
      throw new WarrenError(`${method} ${path}: ${msg}`, res.status);
    }
    if (res.status === 204) return undefined;
    return raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
  }

  /** Create a sandbox from a template (restored from its snapshot). */
  async create(opts: { template?: string } = {}): Promise<Sandbox> {
    const r = await this.request("POST", "/v1/sandboxes", { template: opts.template ?? "default" });
    return new Sandbox(this, r.id, r.template, r.timings);
  }

  /** Attach to an existing sandbox by id. */
  async get(id: string): Promise<Sandbox> {
    const r = await this.request("GET", `/v1/sandboxes/${encodeURIComponent(id)}`);
    return new Sandbox(this, r.id, r.template);
  }

  async list(): Promise<{ id: string; template: string; created_unix: number }[]> {
    return this.request("GET", "/v1/sandboxes");
  }

  async templates(): Promise<TemplateInfo[]> {
    return this.request("GET", "/v1/templates");
  }

  /** Build a template from an OCI image (boots it once and snapshots it). */
  async buildTemplate(opts: { name: string; image: string; vcpus?: number; memMib?: number; prewarmMib?: number }): Promise<TemplateInfo> {
    return this.request("POST", "/v1/templates", {
      name: opts.name,
      image: opts.image,
      vcpus: opts.vcpus,
      mem_mib: opts.memMib,
      prewarm_mib: opts.prewarmMib,
    });
  }
}

export class Sandbox {
  constructor(
    private readonly client: Warren,
    readonly id: string,
    readonly template: string,
    /** Server-side breakdown of how long creation took (present on create). */
    readonly timings?: CreateTimings,
  ) {}

  private get base() {
    return `/v1/sandboxes/${encodeURIComponent(this.id)}`;
  }

  /** Run a command. A string runs through `/bin/sh -c`; an array is exec'd directly. */
  async exec(cmd: string | string[], opts: ExecOptions = {}): Promise<ExecResult> {
    const r = await this.client.request("POST", `${this.base}/exec`, {
      cmd,
      env: opts.env,
      cwd: opts.cwd,
      timeout_ms: opts.timeoutMs,
      stdin: opts.stdin,
    });
    return {
      exitCode: r.exit_code,
      signal: r.signal,
      timedOut: r.timed_out,
      stdout: r.stdout,
      stderr: r.stderr,
      truncated: r.truncated,
      durationMs: r.duration_ms,
    };
  }

  readonly files = {
    read: async (path: string): Promise<Uint8Array> =>
      this.client.request("GET", `${this.base}/files?path=${encodeURIComponent(path)}`, undefined, true),
    readText: async (path: string): Promise<string> => new TextDecoder().decode(await this.files.read(path)),
    write: async (path: string, data: string | Uint8Array, opts: { mode?: number } = {}): Promise<void> => {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const mode = opts.mode !== undefined ? `&mode=${opts.mode.toString(8)}` : "";
      await this.client.request("PUT", `${this.base}/files?path=${encodeURIComponent(path)}${mode}`, bytes);
    },
  };

  async delete(): Promise<void> {
    try {
      await this.client.request("DELETE", this.base);
    } catch (e) {
      if (!(e instanceof WarrenError && e.status === 404)) throw e;
    }
  }

  /** `await using sbx = await warren.create()` deletes the sandbox on scope exit. */
  async [(Symbol as any).asyncDispose ?? Symbol.for("Symbol.asyncDispose")](): Promise<void> {
    await this.delete();
  }
}

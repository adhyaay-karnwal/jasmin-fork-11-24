import leaderboard from "@/data/leaderboard.json";
import fairbench from "@/data/fairbench.json";
import credits from "@/data/credits.json";

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const img = (file: string) => `${BASE}/img/${file}`;
export const REPO = "https://github.com/arjunkshah12345-hash/jasmine-sandbox";
export const INSTALL = "curl -fsSL https://tryjasmine.dev/install | sudo sh";

export type Row = {
  provider: string;
  name: string;
  median: number | null;
  p95: number | null;
  ci95: [number, number] | null;
  attempts: number | null;
  failed: number;
  note: string | null;
  status: string;
  ranked: boolean;
  rank?: number;
};
export type Metric = {
  id: string;
  group: string;
  label: string;
  unit: string;
  better: "lower" | "higher";
  rows: Row[];
  of: number;
  jasmineRank: number | null;
};
export type Provider = { id: string; name: string; ranIn: string | null; cpu: string | null; equalSpec: boolean | null; ranked: boolean };

export const LB = leaderboard as unknown as {
  source: string;
  fetched: string;
  track: string;
  run: { start: string; end: string; observations: number };
  providers: Provider[];
  metrics: Metric[];
  wins: number;
  podium: number;
  measured: number;
};
export const metric = (id: string) => LB.metrics.find((m) => m.id === id)!;
export const jasmineRow = (m: Metric) => m.rows.find((r) => r.provider === "jasmine")!;

/** Head to head: on how many shared metrics Jasmine's median beats each ranked competitor. */
export function headToHead() {
  return LB.providers
    .filter((p) => p.ranked && p.id !== "jasmine")
    .map((p) => {
      let ahead = 0;
      let shared = 0;
      for (const m of LB.metrics) {
        const a = jasmineRow(m);
        const o = m.rows.find((r) => r.provider === p.id && r.ranked);
        if (!a?.median || !o?.median) continue;
        shared++;
        if (m.better === "lower" ? a.median < o.median : a.median > o.median) ahead++;
      }
      return { ...p, ahead, shared };
    })
    .sort((a, b) => b.ahead / b.shared - a.ahead / a.shared || a.name.localeCompare(b.name));
}

/** Human formatting in the metric's own unit. */
export function fmt(v: number | null, unit: string) {
  if (v == null) return "n/a";
  if (unit === "s") return v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
  if (unit === "ms") return v < 10 ? `${v.toFixed(1)} ms` : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
  if (unit === "ops/s") return `${(v / 1e6).toFixed(1)}M ops/s`;
  if (unit === "IOPS") return v >= 1000 ? `${(v / 1000).toFixed(v >= 1e5 ? 0 : 1)}k IOPS` : `${Math.round(v)} IOPS`;
  if (unit === "MB/s") return `${Math.round(v).toLocaleString("en-US")} MB/s`;
  if (unit === "MiB") return `${v.toFixed(1)} MiB`;
  return `${v} ${unit}`;
}

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

type Summary = { n: number; median: number; ci95: [number, number]; p95: number } | null;
export type FairMetric = { better: string; winner: string | null; failures: Record<string, number>; bySystem: Record<string, Summary> };
export const FB = fairbench as unknown as {
  version: string;
  seed: number;
  rounds: number;
  heavyRounds: number;
  limits: { cpu: number; memoryMb: number; image: string };
  host: { cpu: string; cpus: number; memGiB: number; kernel: string };
  systems: Record<string, { isolation: string; available: boolean; sharesHostKernel: boolean; guestKernel: string }>;
  metrics: Record<string, FairMetric>;
};

export const FAIR_LABELS: Record<string, { label: string; unit: string }> = {
  ready_ms: { label: "Create → first command", unit: "ms" },
  exec_ms: { label: "Run a command", unit: "ms" },
  agent_trace_ms: { label: "Held-out agent trace, 40 ops", unit: "ms" },
  exec_under_neighbor_load_ms: { label: "Command next to noisy neighbours", unit: "ms" },
  destroy_ms: { label: "Destroy", unit: "ms" },
  burst_1_all_ready_ms: { label: "1 sandbox, ready", unit: "ms" },
  burst_5_all_ready_ms: { label: "5 at once, all ready", unit: "ms" },
  burst_10_all_ready_ms: { label: "10 at once, all ready", unit: "ms" },
  burst_25_all_ready_ms: { label: "25 at once, all ready", unit: "ms" },
  idle_mem_available_drop_per_sandbox_mib: { label: "Host memory per idle sandbox (MemAvailable)", unit: "MiB" },
  idle_mem_used_per_sandbox_mib: { label: "Host memory per idle sandbox (used)", unit: "MiB" },
  files_1k_ms: { label: "Write + read 1 KiB", unit: "ms" },
  files_16m_ms: { label: "Write + read 16 MiB", unit: "ms" },
  compute_ms: { label: "CPU-bound Python", unit: "ms" },
  small_fsync_ms: { label: "500 small fsync'd files", unit: "ms" },
  big_write_ms: { label: "512 MiB write + fsync", unit: "ms" },
  task_python_ms: { label: "Clone + test a Python repo", unit: "ms" },
  task_node_build_ms: { label: "Vite production build", unit: "ms" },
};
export const SYSTEM_NAMES: Record<string, string> = { jasmine: "Jasmine", docker: "Docker", gvisor: "gVisor", kata: "Kata" };

export const CREDITS = credits as { file: string; title: string; creator: string | null; license: string; licenseUrl: string; page: string }[];

"use client";

import { BarChart } from "@/components/dithercn/bar-chart";
import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { Grid } from "@/components/dither-kit/grid";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { Legend } from "@/components/dither-kit/legend";
import type { DitherColor as KitColor } from "@/components/dither-kit/palette";
import fairbench from "@/data/fairbench.json";

type Summary = { n: number; median: number; ci95: [number, number]; p95: number } | null;
type Metric = { better: string; winner: string | null; failures: Record<string, number>; bySystem: Record<string, Summary> };
const metrics = fairbench.metrics as unknown as Record<string, Metric>;
const systems = Object.entries(fairbench.systems as Record<string, { isolation: string; available: boolean; sharesHostKernel?: boolean }>)
  .filter(([, s]) => s.available)
  .map(([name, s]) => ({ name, ...s }));

const COLORS: Record<string, KitColor> = { warren: "orange", docker: "grey", gvisor: "blue", kata: "purple" };

const CHARTS: { id: string; title: string; note: string }[] = [
  { id: "ready_ms", title: "Create → first command", note: "ms, lower is better" },
  { id: "exec_ms", title: "Run a command", note: "ms, lower is better" },
  { id: "agent_trace_ms", title: "Held-out agent trace (40 ops)", note: "ms, lower is better; generated from a seed picked at run time" },
  { id: "exec_under_neighbor_load_ms", title: "Command latency next to noisy neighbours", note: "ms, lower is better" },
];

function fmt(v: number) {
  return v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
}

export function FairbenchSection() {
  const burstKs = Object.keys(metrics)
    .map((k) => /^burst_(\d+)_all_ready_ms$/.exec(k)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
  const burstData = burstKs.map((k) => {
    const row: Record<string, number | string> = { k: `${k}` };
    for (const s of systems) {
      const v = metrics[`burst_${k}_all_ready_ms`]?.bySystem[s.name];
      if (v) row[s.name] = Math.round(v.median);
    }
    return row;
  });
  const burstConfig = Object.fromEntries(systems.filter((s) => s.name !== "kata").map((s) => [s.name, { label: s.name, color: COLORS[s.name] ?? ("grey" as KitColor) }]));

  return (
    <section id="benchmarks" className="mx-auto w-full max-w-6xl px-6 py-24">
      {fairbench.label && (
        <p className="mb-6 border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-xs text-amber-300">{fairbench.label}</p>
      )}
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">fairbench · {fairbench.version}</p>
      <h2 className="mt-3 max-w-3xl text-3xl font-medium tracking-tight md:text-5xl">Same machine. Same image. Same limits.</h2>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Every system runs on one host, gets the same {fairbench.limits.cpu} vCPU / {fairbench.limits.memoryMb / 1024} GiB and the same{" "}
        <code className="font-mono text-foreground">{fairbench.limits.image}</code> image, and is driven by one client in interleaved,
        randomly ordered rounds. A system only wins a metric when its 95% confidence interval clears every other one; everything else
        is a tie.
      </p>

      <div className="mt-10 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {systems.map((s) => (
          <div key={s.name} className="bg-background p-4">
            <p className="font-mono text-sm">{s.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.isolation}</p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">{s.sharesHostKernel ? "shares the host kernel" : "own kernel"}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        {CHARTS.filter((c) => metrics[c.id]).map((c) => {
          const m = metrics[c.id];
          const data = systems
            .map((s) => ({ system: s.name, value: m.bySystem[s.name]?.median ?? 0 }))
            .filter((d) => d.value > 0);
          return (
            <figure key={c.id} className="border border-border p-5">
              <figcaption className="flex items-baseline justify-between gap-4">
                <span className="text-sm">{c.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">winner: {m.winner ?? "tie"}</span>
              </figcaption>
              <BarChart
                className="mt-4"
                data={data}
                x="system"
                series={[{ label: c.note, value: "value", color: "orange" }]}
                height={180}
                highlight={data.findIndex((d) => d.system === "warren")}
                format={(v: number) => fmt(v)}
              />
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                {data.map((d) => {
                  const ci = m.bySystem[d.system]?.ci95;
                  return `${d.system} ${fmt(d.value)} [${ci ? ci.map(fmt).join("–") : "?"}]`;
                }).join(" · ")}
              </p>
            </figure>
          );
        })}
      </div>

      {burstData.length > 1 && (
        <figure className="mt-10 border border-border p-5">
          <figcaption className="flex items-baseline justify-between gap-4">
            <span className="text-sm">K sandboxes at once, until all have run a command (ms)</span>
            <span className="font-mono text-[11px] text-muted-foreground">x: K · Kata omitted for scale (see table)</span>
          </figcaption>
          <div className="mt-4 h-64">
            <AreaChart data={burstData} config={burstConfig}>
              <Grid />
              <XAxis dataKey="k" />
              <YAxis tickFormatter={(v: number) => `${Math.round(v)} ms`} />
              <Legend align="left" />
              {Object.keys(burstConfig).map((k) => (
                <Area key={k} dataKey={k} />
              ))}
            </AreaChart>
          </div>
        </figure>
      )}

      <div className="mt-10 overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left font-mono text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-3 font-normal">metric</th>
              {systems.map((s) => (
                <th key={s.name} className="p-3 font-normal">{s.name}</th>
              ))}
              <th className="p-3 font-normal">winner</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(metrics).map(([id, m]) => (
              <tr key={id} className="border-b border-border/60 last:border-0">
                <td className="p-3 text-muted-foreground">{id.replace(/_/g, " ")}</td>
                {systems.map((s) => {
                  const v = m.bySystem[s.name];
                  const f = m.failures[s.name];
                  return (
                    <td key={s.name} className={`p-3 ${m.winner === s.name ? "text-orange-400" : ""}`}>
                      {v ? fmt(v.median) : "—"}
                      {f ? <span className="text-red-400"> ({f} failed)</span> : null}
                    </td>
                  );
                })}
                <td className="p-3">{m.winner ?? "tie"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Host: {fairbench.host.cpu}, {fairbench.host.cpus} CPUs, nested virtualization (a GitHub Actions runner). Seed {fairbench.seed},{" "}
        {fairbench.rounds} rounds. Every sample is in the repo:{" "}
        <a className="underline underline-offset-4" href="https://github.com/arjunkshah12345-hash/warren/tree/master/bench/fair">bench/fair</a>.
      </p>
    </section>
  );
}

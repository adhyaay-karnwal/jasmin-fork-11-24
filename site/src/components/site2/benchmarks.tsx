"use client";

import { useState } from "react";
import { BarChart } from "@/components/dithercn/bar-chart";
import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { Grid } from "@/components/dither-kit/grid";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { Legend } from "@/components/dither-kit/legend";
import type { DitherColor as KitColor } from "@/components/dither-kit/palette";
import { LB, FB, FAIR_LABELS, SYSTEM_NAMES, fmt, REPO, type Metric } from "@/lib/jasmine-data";
import { Heading } from "./bits";
import { HeadToHeadGrid } from "./features";

const groups = Array.from(new Set(LB.metrics.map((m) => m.group)));

function Board({ m }: { m: Metric }) {
  const ranked = m.rows.filter((r) => r.ranked && r.median != null);
  const shown = m.rows.filter((r) => !r.ranked && r.median != null);
  const absent = m.rows.filter((r) => r.median == null);
  const max = Math.max(...m.rows.filter((r) => r.median != null).map((r) => Math.max(r.median!, r.p95 ?? 0)));
  const w = (v: number) => `${Math.max(0.8, (v / max) * 100)}%`;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c0e0c] p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-medium text-white">{m.label}</h3>
        <span className="text-sm text-zinc-500">
          {m.better === "lower" ? "lower is better" : "higher is better"} · bar = median, tick = p95
        </span>
      </div>
      <table className="mt-4 w-full text-[13.5px] tabular-nums">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="w-8 py-2 font-normal">#</th>
            <th className="py-2 font-normal">Provider</th>
            <th className="hidden w-[42%] py-2 font-normal sm:table-cell" />
            <th className="py-2 text-right font-normal">Median</th>
            <th className="hidden py-2 text-right font-normal md:table-cell">p95</th>
          </tr>
        </thead>
        <tbody>
          {[...ranked, ...shown].map((r) => {
            const me = r.provider === "jasmine";
            return (
              <tr key={r.provider} className={`border-t border-white/[0.06] ${me ? "bg-[var(--leaf)]/[0.08]" : ""} ${r.ranked ? "" : "text-zinc-600"}`}>
                <td className={`py-1.5 ${me ? "text-[var(--leaf)]" : "text-zinc-500"}`}>{r.rank ?? "–"}</td>
                <td className={`py-1.5 ${me ? "font-medium text-white" : r.ranked ? "text-zinc-300" : ""}`}>
                  {r.name}
                  {!r.ranked && "*"}
                  {r.failed ? <span className="text-red-400/80"> · {r.failed} failed</span> : null}
                </td>
                <td className="relative hidden py-1.5 sm:table-cell">
                  <span className={`block h-2 rounded-full ${me ? "bg-[var(--leaf)]" : "bg-zinc-600"}`} style={{ width: w(r.median!) }} />
                  {r.p95 != null && <span className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-zinc-300/60" style={{ left: w(r.p95) }} />}
                </td>
                <td className={`py-1.5 text-right ${me ? "font-medium text-[var(--leaf)]" : "text-zinc-300"}`}>{fmt(r.median, m.unit)}</td>
                <td className="hidden py-1.5 text-right text-zinc-500 md:table-cell">{fmt(r.p95, m.unit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {absent.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-white/[0.06] pt-3 text-[13px] text-zinc-500">
          {absent.map((r) => (
            <li key={r.provider}>
              <span className="text-zinc-300">{r.name}</span>: {r.note || r.status}
            </li>
          ))}
        </ul>
      )}
      {shown.length > 0 && <p className="mt-3 text-[12px] text-zinc-600">* shown, not ranked: shared or spot tiers, or a machine that measured other than 4 vCPU / 8 GB.</p>}
    </div>
  );
}

const FAIR = [
  "ready_ms", "exec_ms", "agent_trace_ms", "exec_under_neighbor_load_ms", "destroy_ms",
  "burst_1_all_ready_ms", "burst_5_all_ready_ms", "burst_10_all_ready_ms", "burst_25_all_ready_ms",
  "idle_mem_available_drop_per_sandbox_mib", "idle_mem_used_per_sandbox_mib",
  "files_1k_ms", "files_16m_ms", "compute_ms", "small_fsync_ms", "big_write_ms", "task_python_ms", "task_node_build_ms",
];
const SYS = ["jasmine", "docker", "gvisor", "kata"];

export function Benchmarks() {
  const [id, setId] = useState("cold");
  const [fsel, setFsel] = useState("agent_trace_ms");
  const m = LB.metrics.find((x) => x.id === id)!;
  const fm = FB.metrics[fsel];
  const funit = FAIR_LABELS[fsel]?.unit ?? "ms";
  const fwins = FAIR.filter((k) => FB.metrics[k]?.winner === "jasmine").length;
  const fdocker = FAIR.filter((k) => FB.metrics[k]?.winner === "docker").length;
  const burstData = [1, 5, 10, 25].map((k) => {
    const row: Record<string, number | string> = { k: `${k}` };
    for (const s of ["jasmine", "docker", "gvisor"]) row[s] = Math.round(FB.metrics[`burst_${k}_all_ready_ms`].bySystem[s]!.median);
    return row;
  });
  const burstConfig: Record<string, { label: string; color: KitColor }> = {
    jasmine: { label: "Jasmine", color: "green" },
    docker: { label: "Docker", color: "grey" },
    gvisor: { label: "gVisor", color: "blue" },
  };

  return (
    <section id="benchmarks" className="border-t border-white/[0.06] bg-[#080908]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Heading kicker="Benchmarks" title={<>First on {LB.wins} of {LB.metrics.length} public benchmarks</>}>
          aisandboxbench.com runs {LB.providers.filter((p) => p.ranked).length - 1} hosted sandbox providers through one open-source
          harness on a 4 vCPU / 8 GB machine. We ran Jasmine through the same harness with its published flags. Every metric is below,
          including the ones we lose.
        </Heading>

        <div className="mt-12 grid gap-6 lg:grid-cols-[280px_1fr]">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-5 lg:overflow-visible lg:pb-0" aria-label="Metrics">
            {groups.map((g) => (
              <div key={g} className="contents lg:block">
                <p className="hidden pb-1.5 text-xs text-zinc-500 lg:block">{g}</p>
                {LB.metrics
                  .filter((x) => x.group === g)
                  .map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => setId(x.id)}
                      className={`flex w-full shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm transition lg:whitespace-normal ${
                        x.id === id ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <span>{x.label}</span>
                      <span className={`tabular-nums ${x.jasmineRank === 1 ? "text-[var(--leaf)]" : "text-zinc-500"}`}>
                        #{x.jasmineRank}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <div>
            <Board m={m} />
            <p className="mt-4 text-[13px] leading-relaxed text-zinc-500">
              Published results from aisandboxbench.com/results.json (same-machine track, fetched {LB.fetched}). Jasmine was self-run on
              one GitHub Actions runner with nested virtualization, its client on the same runner going out and back through a
              Cloudflare tunnel; the hosted providers were measured from a client in Florida. Not an official listing.{" "}
              <a className="text-zinc-300 underline underline-offset-4" href={`${REPO}/blob/master/results/aisandboxbench-2026-11-21.md`}>
                Raw data and caveats
              </a>
            </p>
          </div>
        </div>

        <h3 className="mt-20 text-xl font-medium text-white">Head to head: metrics where Jasmine&apos;s median wins</h3>
        <HeadToHeadGrid />

        <div className="mt-24">
          <Heading kicker="fairbench" title="Same machine as Docker, gVisor and Kata">
            All four on one host with the same {FB.limits.image} image and {FB.limits.cpu} vCPU / {FB.limits.memoryMb / 1024} GiB, in{" "}
            {FB.rounds} interleaved rounds with a workload generated from a seed picked at run time. A win needs a 95% confidence interval
            that clears every other system. Jasmine wins {fwins} of {FAIR.length}, Docker {fdocker}, the rest tie.
          </Heading>
          <div className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c0e0c]">
              <table className="w-full min-w-[560px] text-[13px] tabular-nums">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-normal">Metric</th>
                    {SYS.map((s) => (
                      <th key={s} className={`px-3 py-3 text-right font-normal ${s === "jasmine" ? "text-[var(--leaf)]" : ""}`}>
                        {SYSTEM_NAMES[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FAIR.map((k) => {
                    const r = FB.metrics[k];
                    const u = FAIR_LABELS[k]?.unit ?? "ms";
                    return (
                      <tr
                        key={k}
                        onMouseEnter={() => setFsel(k)}
                        onClick={() => setFsel(k)}
                        className={`cursor-pointer border-t border-white/[0.06] transition ${k === fsel ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}
                      >
                        <td className="px-4 py-2 text-zinc-300">{FAIR_LABELS[k]?.label}</td>
                        {SYS.map((s) => (
                          <td key={s} className={`whitespace-nowrap px-3 py-2 text-right ${r.winner === s ? "font-medium text-[var(--leaf)]" : "text-zinc-400"}`}>
                            {fmt(r.bySystem[s]?.median ?? null, u)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-6">
              <figure className="rounded-2xl border border-white/10 bg-[#0c0e0c] p-5">
                <figcaption className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-white">{FAIR_LABELS[fsel]?.label}</span>
                  <span className="text-[13px] text-zinc-500">{fm.winner ? `${SYSTEM_NAMES[fm.winner]} wins` : "tie"}</span>
                </figcaption>
                <BarChart
                  className="mt-4"
                  data={SYS.map((s) => ({ system: SYSTEM_NAMES[s], value: fm.bySystem[s]?.median ?? 0 }))}
                  x="system"
                  series={[{ label: `median ${funit}`, value: "value", color: "green" }]}
                  height={220}
                  highlight={0}
                  format={(v: number) => fmt(v, funit)}
                />
              </figure>
              <figure className="rounded-2xl border border-white/10 bg-[#0c0e0c] p-5">
                <figcaption className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-white">K sandboxes at once, all ready</span>
                  <span className="text-[13px] text-zinc-500">ms · Kata off-scale (25.5 s at K=25)</span>
                </figcaption>
                <div className="mt-4 h-56">
                  <AreaChart data={burstData} config={burstConfig}>
                    <Grid />
                    <XAxis dataKey="k" />
                    <YAxis tickFormatter={(v: number) => `${Math.round(v)}`} />
                    <Legend align="left" />
                    {Object.keys(burstConfig).map((k) => (
                      <Area key={k} dataKey={k} />
                    ))}
                  </AreaChart>
                </div>
              </figure>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-zinc-500">
            Host: {FB.host.cpu}, {FB.host.cpus} CPUs, nested virtualization, which taxes the two microVMs (Jasmine, Kata) more than bare
            metal would. Docker shares the host kernel; the others don&apos;t. Seed {FB.seed}.
          </p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { GrainGradient } from "@/components/grain-gradient";
import { TerminalWindow, type TerminalStep } from "@/components/asciicn/terminal-window";
import { DitherButton } from "@/components/dithercn/dither-button";
import { StatusDot } from "@/components/asciicn/status-dot";
import { LB, metric, jasmineRow as jRow, fmt, ordinal, REPO, INSTALL } from "@/lib/jasmine-data";
import { CopyInstall } from "./bits";
import { Scramble } from "./extra";

const cold = metric("cold");
const racers = cold.rows.filter((r) => r.ranked && r.median != null).slice().sort((a, b) => a.name.localeCompare(b.name));
const slowest = Math.max(...racers.map((r) => r.median!));
export const COLD_MS = Math.round(jRow(cold).median! * 1000);

export function Race() {
  const [t, setT] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(slowest + 1);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (ref.current) io.observe(ref.current);
    const loop = (now: number) => {
      if (start == null) start = now;
      const s = (now - start) / 1000;
      if (s > slowest + 2.5) start = now;
      if (visible) setT(s);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);
  const place = (m: number) => racers.filter((o) => o.median! < m).length + 1;
  const done = racers.filter((r) => r.median! <= t).length;
  return (
    <div ref={ref} className="flex h-full flex-col text-[13px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-zinc-400">
        <span>Cold start · create → first command</span>
        <span className="font-mono tabular-nums text-zinc-200">{Math.min(t, slowest).toFixed(2)}s</span>
      </div>
      <ol className="flex flex-1 flex-col justify-between px-4 py-3">
        {racers.map((r) => {
          const me = r.provider === "jasmine";
          const fin = r.median! <= t;
          return (
            <li key={r.provider} className="grid grid-cols-[8.5rem_1fr_6.5rem] items-center gap-3">
              <span className={`truncate ${me ? "font-medium text-white" : "text-zinc-400"}`}>{r.name}</span>
              <span className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className={`absolute inset-0 origin-left rounded-full ${me ? "bg-[var(--leaf)]" : "bg-zinc-500"}`}
                  style={{ transform: `scaleX(${Math.min(1, t / r.median!)})` }}
                />
              </span>
              <span className={`text-right font-mono tabular-nums ${me ? "text-[var(--leaf)]" : "text-zinc-500"}`}>
                {fin ? `${ordinal(place(r.median!))} ${fmt(r.median, "s")}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="border-t border-white/10 px-4 py-2 text-[12px] text-zinc-500">
        {done}/{racers.length} ready · each bar runs for its provider&apos;s published median, in real time
      </div>
    </div>
  );
}

const session: TerminalStep[] = [
  { kind: "command", text: "curl -fsSL tryjasmine.dev/install | sudo sh" },
  { kind: "task", text: "firecracker, guest kernel, xfs reflink store", duration: 1.2, result: "ok", done: "host ready" },
  { kind: "command", text: "sudo jasmined build default python:3.12-slim" },
  { kind: "progress", label: "boot → prewarm → snapshot", duration: 1.6 },
  { kind: "output", text: "template default ready", tone: "ok" },
  { kind: "command", text: "node agent.mjs" },
  { kind: "output", text: "sandbox sbx_7f3a2c ready in 0.10s", tone: "info" },
  { kind: "output", text: "exec python3 -c 'print(6*7)' → 42 (4.1ms)" },
  { kind: "output", text: "snapshot → 4 forks started in 0.10s each", tone: "ok" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <GrainGradient
          colors={["#0b0d0a", "#1d3a1c", "#5f8f45", "#f0b7cc", "#0b0d0a"]}
          background="#070807"
          speed={0.35}
          grain={0.45}
          blur={0.55}
          dither={{ enabled: true }}
          className="h-full w-full"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#070807_75%)]" />
      </div>
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-10 text-center md:pt-28">
        <a href="/blog/introducing-jasmine" className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[13px] text-zinc-300 backdrop-blur hover:border-white/20">
          <StatusDot status="online" showLabel={false} size="sm" />
          Launch week: docs, blog and Jasmine Cloud early access
          <span className="text-zinc-500 transition group-hover:translate-x-0.5">→</span>
        </a>
        <h1 className="mx-auto mt-7 max-w-4xl text-[clamp(2.6rem,6.4vw,5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-white">
          Sandboxes for AI agents,{" "}
          <br className="hidden sm:block" />
          ready in <Scramble text={`${COLD_MS} ms`} className="text-[var(--leaf)]" delay={250} />.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
          Open-source Firecracker microVMs restored from memory snapshots. First on {LB.wins} of {LB.metrics.length} public
          benchmarks against {LB.providers.filter((p) => p.ranked).length - 1} hosted providers, and it runs on your own Linux box.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <DitherButton asChild size="lg" color="var(--leaf)">
            <a href="/docs">Get started</a>
          </DitherButton>
          <DitherButton asChild size="lg" variant="outline" color="ink">
            <a href={REPO}>Star on GitHub</a>
          </DitherButton>
        </div>
        <div className="mt-6 flex justify-center">
          <CopyInstall command={INSTALL} />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-24">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e0c]/80 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="size-3 rounded-full bg-white/10" />
            <span className="size-3 rounded-full bg-white/10" />
            <span className="size-3 rounded-full bg-white/10" />
            <span className="ml-3 font-mono text-[12px] text-zinc-500">jasmine · same-machine track, 4 vCPU / 8 GB</span>
          </div>
          <div className="grid md:grid-cols-[1.15fr_1fr]">
            <div className="min-h-[430px] border-b border-white/10 md:border-r md:border-b-0">
              <Race />
            </div>
            <div className="flex items-center bg-black/30 p-4">
              <TerminalWindow script={session} title="~/agent — zsh" size="md" rows={20} speed={1.1} className="w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

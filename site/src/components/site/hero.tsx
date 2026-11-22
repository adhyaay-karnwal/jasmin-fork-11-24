"use client";

import { GrainGradient } from "@/components/grain-gradient";
import { DitherButton } from "@/components/dithercn/dither-button";
import { DitherNumber } from "@/components/dithercn/dither-number";
import { CopyCommand } from "@/components/site/copy-command";
import fairbench from "@/data/fairbench.json";

const REPO = "https://github.com/arjunkshah12345-hash/warren";
type M = Record<string, { bySystem: Record<string, { median: number } | null> }>;
const m = fairbench.metrics as unknown as M;
const med = (id: string, s = "warren") => m[id]?.bySystem[s]?.median ?? null;

export function Hero() {
  const ready = med("ready_ms");
  const exec = med("exec_ms");
  const dockerReady = med("ready_ms", "docker");
  return (
    <GrainGradient
      className="relative isolate min-h-[92vh] w-full"
      colors={["#0b0b0c", "#3a1606", "#ff6a1a", "#1b1d2a"]}
      background="#08080a"
      speed={0.35}
      grain={0.35}
      warp={0.45}
      dither={{ enabled: true, cell: 3, levels: 4 }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-background" />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 font-mono text-sm">
        <span className="tracking-tight">warren</span>
        <nav className="flex items-center gap-6 text-muted-foreground">
          <a href="#benchmarks" className="hover:text-foreground">benchmarks</a>
          <a href="#how" className="hover:text-foreground">how it works</a>
          <a href="#install" className="hover:text-foreground">install</a>
          <a href={REPO} className="text-foreground">github ↗</a>
        </nav>
      </header>
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-6 pt-[14vh] pb-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-orange-300/90">open source · apache-2.0 · self-hosted</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-medium leading-[1.02] tracking-[-0.04em] md:text-7xl">
          Sandboxes for agents.
          <br />
          <span className="text-white/60">Each one its own microVM.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-white/70">
          Warren restores every sandbox from a Firecracker snapshot instead of booting it. Your agent gets its own kernel, its own disk
          and a fresh RNG, fast enough that you stop thinking about it. Run it on any Linux box with KVM.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="#install">
            <DitherButton size="lg">Get started</DitherButton>
          </a>
          <a href={REPO}>
            <DitherButton size="lg" variant="outline">Star on GitHub</DitherButton>
          </a>
        </div>
        <CopyCommand className="mt-6" command="curl -fsSL https://raw.githubusercontent.com/arjunkshah12345-hash/warren/master/install.sh | sudo sh" />

        {ready !== null && exec !== null && (
          <dl className="mt-16 grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-3">
            <div>
              <dd><DitherNumber value={Math.round(ready)} suffix=" ms" size="lg" color="orange" trigger="in-view" /></dd>
              <dt className="mt-2 font-mono text-xs text-white/60">create → first command finished</dt>
            </div>
            <div>
              <dd><DitherNumber value={Number(exec.toFixed(1))} format={{ maximumFractionDigits: 1 }} suffix=" ms" size="lg" trigger="in-view" /></dd>
              <dt className="mt-2 font-mono text-xs text-white/60">to run a command in a live sandbox</dt>
            </div>
            {dockerReady !== null && (
              <div>
                <dd><DitherNumber value={Number((dockerReady / ready).toFixed(1))} format={{ maximumFractionDigits: 1 }} suffix="×" size="lg" trigger="in-view" /></dd>
                <dt className="mt-2 font-mono text-xs text-white/60">faster to ready than a Docker container, same host</dt>
              </div>
            )}
          </dl>
        )}
      </div>
    </GrainGradient>
  );
}

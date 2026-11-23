"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { DitherButton } from "@/components/dithercn/dither-button";
import { Card, Heading } from "./bits";

const GLYPHS = "░▒▓█▚▞▖▗▘▝";

/** Text that resolves out of dither glyphs, left to right, the first time it scrolls into view. */
export function Scramble({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  const [out, setOut] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !ref.current) return;
    let raf = 0;
    let t0: number | null = null;
    const dur = 900;
    const run = (now: number) => {
      t0 ??= now + delay;
      const p = Math.max(0, Math.min(1, (now - t0) / dur));
      const settled = Math.floor(p * text.length);
      setOut(
        [...text]
          .map((c, i) => (i < settled || c === " " ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join(""),
      );
      if (p < 1) raf = requestAnimationFrame(run);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        io.disconnect();
        raf = requestAnimationFrame(run);
      }
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text, delay, reduce]);
  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{out}</span>
    </span>
  );
}

/**
 * Fade and lift a section in as it enters the viewport. CSS transitions only (no filters), and the content
 * stays visible without JavaScript: only sections still below the fold on mount are hidden, then revealed.
 */
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState("hidden");
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={
        state === "static" ? undefined : `transition-[opacity,transform] duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${state === "hidden" ? "translate-y-7 opacity-0" : "translate-y-0 opacity-100"}`
      }
    >
      {children}
    </div>
  );
}

const TICKS = [
  ["pip install pandas", "done"],
  ["pytest -q", "passed"],
  ["git clone --depth 1", "cloned"],
  ["npm run build", "built"],
  ["python3 -c 'print(6*7)'", "42"],
  ["sbx.pause()", "state kept"],
  ["sbx.snapshot()", "→ 4 forks"],
  ["curl metadata.internal", "blocked"],
  ["vite dev --port 3000", "preview ready"],
  ["cargo test", "ok"],
  ["rm -rf /", "only this VM"],
];

/** A slow marquee of things agents run in Jasmine sandboxes. */
export function Ticker() {
  const row = (
    <div className="flex shrink-0 items-center gap-10 pr-10">
      {TICKS.map(([c, r]) => (
        <span key={c} className="flex items-center gap-3 whitespace-nowrap font-mono text-[13px]">
          <span className="text-zinc-600">$</span>
          <span className="text-zinc-300">{c}</span>
          <span className="text-[var(--leaf)]">{r}</span>
          <span className="ml-6 select-none text-zinc-800" aria-hidden>░▒▓</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-black/30 py-4 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]" aria-label="Commands agents run in Jasmine sandboxes">
      <div className="flex w-max animate-[ticker_60s_linear_infinite] motion-reduce:animate-none">
        {row}
        {row}
      </div>
    </div>
  );
}

/** Homepage section: the agent setup prompt, one click to copy. */
export function AgentSetup({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const preview = prompt.split("\n").slice(0, 16).join("\n");
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-[0.85fr_1.15fr]">
      <div>
        <Heading kicker="Setup in one paste" title={<>Let your agent install it</>}>
          Paste one prompt into Claude Code, Codex or Cursor. It checks for KVM, installs Jasmine, starts the API with a key, runs a smoke test, and moves your
          model-generated code into sandboxes.
        </Heading>
        <div className="mt-8 flex flex-wrap gap-3">
          <DitherButton
            size="lg"
            color="var(--leaf)"
            onClick={() =>
              navigator.clipboard.writeText(prompt).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              })
            }
          >
            {copied ? "Copied. Now paste it." : "Copy the prompt"}
          </DitherButton>
          <DitherButton asChild size="lg" variant="outline" color="ink">
            <a href="/docs/agents">Read it first</a>
          </DitherButton>
        </div>
      </div>
      <Card className="bg-black/40">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3 font-mono text-xs text-zinc-500">
          <span>agent-setup.md</span>
          <span className="text-[var(--leaf)]">{prompt.split(/\s+/).length} words</span>
        </div>
        <pre className="relative max-h-[22rem] overflow-hidden whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-zinc-400 [mask-image:linear-gradient(#000_60%,transparent)]">{preview}</pre>
      </Card>
    </section>
  );
}

const BAYER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'%3E%3Crect width='1' height='1' fill='%23a6e86b'/%3E%3Crect x='2' y='2' width='1' height='1' fill='%23a6e86b'/%3E%3Crect x='2' width='1' height='1' fill='%23a6e86b' opacity='.55'/%3E%3Crect y='2' width='1' height='1' fill='%23a6e86b' opacity='.55'/%3E%3Crect x='1' y='1' width='1' height='1' fill='%23f0b7cc' opacity='.5'/%3E%3Crect x='3' y='3' width='1' height='1' fill='%23f0b7cc' opacity='.35'/%3E%3C/svg%3E";

/** A huge wordmark filled with a Bayer dither that drifts slowly. */
export function DitherWordmark() {
  return (
    <div className="pointer-events-none select-none overflow-hidden px-4" aria-hidden>
      <p
        className="animate-[dither-drift_18s_linear_infinite] bg-clip-text text-center text-[22vw] font-semibold leading-[0.8] tracking-[-0.07em] text-transparent motion-reduce:animate-none [mask-image:linear-gradient(#000_20%,transparent_95%)]"
        style={{ backgroundImage: `url("${BAYER}")`, backgroundSize: "6px 6px", imageRendering: "pixelated" }}
      >
        jasmine
      </p>
    </div>
  );
}

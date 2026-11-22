"use client";

import { useEffect, useRef, useState } from "react";
import { TerminalWindow, type TerminalStep } from "@/components/asciicn/terminal-window";
import { LB, metric, jasmineRow, fmt, ordinal, REPO } from "@/lib/jasmine-data";

const cold = metric("cold");
const racers = cold.rows
  .filter((r) => r.ranked && r.median != null)
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name));
const slowest = Math.max(...racers.map((r) => r.median!));
const coldJasmine = jasmineRow(cold).median!;

/** Cold start, raced at real speed: every bar fills in exactly its provider's published median. */
function Race({ active }: { active: boolean }) {
  const [t, setT] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setT(slowest + 1);
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      if (start.current == null) start.current = now;
      const s = (now - start.current) / 1000;
      if (s > slowest + 2.2) start.current = now;
      setT(s);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      start.current = null;
    };
  }, [active]);
  const finished = racers.filter((r) => r.median! <= t).length;
  const place = (r: (typeof racers)[number]) => racers.filter((o) => o.median! < r.median!).length + 1;
  return (
    <div className="race" data-ui aria-label={`Cold start medians for ${racers.length} providers, played in real time`}>
      <div className="race-head">
        <span>Cold start: create → first command</span>
        <span className="race-clock">{Math.min(t, slowest).toFixed(2)} s</span>
      </div>
      <ol className="race-rows">
        {racers.map((r) => {
          const done = r.median! <= t;
          const w = Math.min(1, t / r.median!);
          return (
            <li key={r.provider} className={r.provider === "jasmine" ? "is-jasmine" : undefined}>
              <span className="race-name">{r.name}</span>
              <span className="race-track">
                <span className="race-bar" style={{ transform: `scaleX(${w})` }} />
              </span>
              <span className="race-time">{done ? `${ordinal(place(r))} · ${fmt(r.median, "s")}` : ""}</span>
            </li>
          );
        })}
      </ol>
      <div className="race-foot">
        {finished}/{racers.length} ready · each bar takes its provider&apos;s published median
      </div>
    </div>
  );
}

const session: TerminalStep[] = [
  { kind: "command", text: `A=localhost:7171/v1/sandboxes; J="content-type: application/json"` },
  { kind: "command", text: `S=$(curl -sH "$J" $A -d '{}' | jq -r .id); echo $S` },
  { kind: "output", text: "sbx_7f3a2c9e41d0b6a5", tone: "ok" },
  { kind: "command", text: `curl -sH "$J" $A/$S/exec -d '{"cmd":"python3 -c \"print(6*7)\""}' | jq -c '{stdout,exit_code}'`, },
  { kind: "output", text: `{"stdout":"42\n","exit_code":0}` },
  { kind: "command", text: `curl -sH "$J" $A/$S/exec -d '{"cmd":"timeout 2 bash -c \"</dev/tcp/169.254.169.254/80\""}' | jq .exit_code` },
  { kind: "output", text: "124", tone: "warn" },
  { kind: "command", text: `curl -s -XPOST $A/$S/pause && curl -s $A/$S | jq -r .state` },
  { kind: "output", text: "paused", tone: "info" },
];

function Fork() {
  const snap = jasmineRow(metric("snapshot")).median!;
  const from = jasmineRow(metric("create-from-snapshot")).median!;
  return (
    <div className="fork" data-ui>
      <div className="fork-row">
        <span className="dot" /> sbx_7f3a2c <em>running, mid-task</em>
      </div>
      <div className="fork-op">
        POST /v1/sandboxes/sbx_7f3a2c/snapshot → template <b>snap_41c0</b> · {fmt(snap, "s")}
      </div>
      {["sbx_90d1", "sbx_90d2", "sbx_90d3", "sbx_90d4"].map((id, i) => (
        <div className="fork-row is-child" key={id} style={{ ["--i" as string]: i }}>
          <span className="dot" /> {id} <em>from snap_41c0 · {fmt(from, "s")}</em>
        </div>
      ))}
      <div className="fork-note">Memory, files and running processes carry into every copy.</div>
    </div>
  );
}

function Burst({ active }: { active: boolean }) {
  const all = jasmineRow(metric("burst-25")).median!;
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const id = setInterval(() => {
      n = n >= 25 + 12 ? 0 : n + 1;
      setLit(Math.min(n, 25));
    }, (all * 1000) / 25);
    return () => clearInterval(id);
  }, [active, all]);
  return (
    <div className="burst" data-ui>
      <div className="race-head">
        <span>25 sandboxes created at once</span>
        <span className="race-clock">all ready · {fmt(all, "s")}</span>
      </div>
      <div className="burst-grid">
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} className={i < lit ? "is-on" : undefined} />
        ))}
      </div>
      <div className="race-foot">Median of 3 cohorts on aisandboxbench&apos;s harness. Cells light at an even pace.</div>
    </div>
  );
}

const FRAMES = [
  { key: "race", caption: `${racers.length} providers, cold start at real speed` },
  { key: "term", caption: "Create, run, the metadata endpoint unreachable, pause" },
  { key: "fork", caption: "Snapshot a running sandbox, start copies from it" },
  { key: "burst", caption: "Twenty-five at once" },
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    const on = () => {
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setP(Math.max(0, Math.min(1, -r.top / total)));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  const pos = p * (FRAMES.length - 1);
  const active = Math.round(pos);
  return (
    <section className="hero" ref={ref} style={{ ["--pos" as string]: pos }}>
      <div className="hero-stage">
        <nav className="nav" aria-label="Main">
          <a className="wordmark" href="#top">Jasmine</a>
          <div className="nav-links">
            <a href="#leaderboard">Benchmarks</a>
            <a href="#how">How it works</a>
            <a href={REPO}>GitHub</a>
            <a className="btn btn-small" href="#install">Install</a>
          </div>
        </nav>
        <h1 className="hero-h">
          <span className="hero-left">Agent sandboxes</span>
          <span className="hero-right">ready in {Math.round(coldJasmine * 1000)} ms</span>
        </h1>
        <div className="reel" aria-live="off">
          <div className="reel-track">
            {FRAMES.map((f, i) => (
              <figure className={`frame${i === active ? " is-active" : ""}`} key={f.key}>
                <div className="frame-body">
                  {f.key === "race" && <Race active={i === active} />}
                  {f.key === "term" && (
                    <div className="term" data-ui>
                      <TerminalWindow script={session} title="jasmine — zsh" size="sm" rows={13} speed={1.2} />
                    </div>
                  )}
                  {f.key === "fork" && <Fork />}
                  {f.key === "burst" && <Burst active={i === active} />}
                </div>
                <figcaption>{f.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
        <div className="hero-foot">
          <p>
            Open-source Firecracker microVMs, restored from a memory snapshot instead of booted. First on {LB.wins} of{" "}
            {LB.metrics.length} metrics against {LB.providers.filter((x) => x.ranked).length - 1} hosted providers, on hardware you own.
          </p>
          <a className="btn" href="#install">Install on Linux</a>
        </div>
      </div>
    </section>
  );
}

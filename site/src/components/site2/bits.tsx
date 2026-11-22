"use client";

import { useState, type ReactNode } from "react";

export function CopyInstall({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="group flex max-w-full items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-left font-mono text-[13px] text-zinc-300 backdrop-blur transition hover:border-white/20"
      aria-label="Copy install command"
    >
      <span className="text-[var(--leaf)]">$</span>
      <span className="truncate">{command}</span>
      <span className="ml-1 shrink-0 text-zinc-500 group-hover:text-zinc-300">{copied ? "copied" : "copy"}</span>
    </button>
  );
}

export function Heading({ kicker, title, children, center }: { kicker: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-sm font-medium text-[var(--leaf)]">{kicker}</p>
      <h2 className="mt-3 text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">{title}</h2>
      {children && <p className="mt-4 text-lg leading-relaxed text-zinc-400">{children}</p>}
    </div>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] ${className}`}>{children}</div>;
}

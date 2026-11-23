"use client";

import { useState, type ReactNode } from "react";

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
      className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-sans text-xs text-zinc-400 transition hover:text-white"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function Code({ children, lang, title }: { children: string; lang?: string; title?: string }) {
  const text = children.replace(/^\n/, "").replace(/\n\s*$/, "");
  return (
    <div className="group my-5 overflow-hidden rounded-xl border border-white/10 bg-black/50">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
        <span>{title ?? lang ?? "shell"}</span>
        <Copy text={text} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-zinc-200">{text}</pre>
    </div>
  );
}

export function Callout({ children, tone = "leaf" }: { children: ReactNode; tone?: "leaf" | "bud" }) {
  return (
    <div className={`my-6 rounded-xl border px-4 py-3 text-[15px] leading-relaxed ${tone === "leaf" ? "border-[var(--leaf)]/25 bg-[var(--leaf)]/[0.05] text-zinc-300" : "border-[var(--bud)]/25 bg-[var(--bud)]/[0.06] text-zinc-300"}`}>
      {children}
    </div>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyCommand({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={cn(
        "group flex max-w-full items-center gap-3 border border-white/15 bg-black/50 px-4 py-3 text-left font-mono text-[13px] backdrop-blur hover:border-white/30",
        className,
      )}
      aria-label="Copy install command"
    >
      <span className="text-orange-300">$</span>
      <span className="truncate text-white/85">{command}</span>
      <span className="ml-2 shrink-0 text-white/50 group-hover:text-white/80">{copied ? "copied" : "copy"}</span>
    </button>
  );
}

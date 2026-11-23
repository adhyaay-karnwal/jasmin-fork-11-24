import { fmtDate } from "@/content/blog";

export function Meta({ tag, date }: { tag: string; date: string }) {
  return (
    <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider text-zinc-500">
      <span className="rounded-full border border-white/15 px-2 py-0.5 text-zinc-300">{tag}</span>
      {fmtDate(date)}
    </p>
  );
}

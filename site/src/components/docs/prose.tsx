import type { ReactNode } from "react";

/** Server-safe typography for docs and blog pages. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[16px] leading-[1.75] text-zinc-300
        [&_a]:text-[var(--leaf)] [&_a]:underline-offset-2 hover:[&_a]:underline
        [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.86em] [&_code]:text-zinc-100
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_h2]:mt-14 [&_h2]:scroll-mt-20 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-white
        [&_h3]:mt-9 [&_h3]:scroll-mt-20 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-white
        [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5
        [&_li]:marker:text-zinc-600 [&_strong]:font-medium [&_strong]:text-white
        [&_table]:mt-6 [&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_th]:border-b [&_th]:border-white/10 [&_th]:py-2 [&_th]:pr-4 [&_th]:font-medium [&_th]:text-white
        [&_td]:border-b [&_td]:border-white/[0.05] [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top"
    >
      {children}
    </div>
  );
}

export function DocTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="border-b border-white/[0.06] pb-8">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--leaf)]">{kicker}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-white">{title}</h1>
      {children && <p className="mt-4 text-lg leading-relaxed text-zinc-400">{children}</p>}
    </header>
  );
}

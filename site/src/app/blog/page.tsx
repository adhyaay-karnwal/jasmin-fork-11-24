import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site2/rest";
import { POSTS } from "@/content/blog";
import { Cover } from "./cover";
import { Meta } from "./meta";

export const metadata: Metadata = { title: "Blog · Jasmine", description: "Engineering notes, benchmarks and releases from the Jasmine team." };

export default function Blog() {
  const [lead, ...rest] = POSTS;
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--leaf)]">Blog</p>
        <h1 className="mt-3 text-[clamp(2.4rem,5vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-white">Notes from the sandbox</h1>
        <p className="mt-4 max-w-xl text-lg text-zinc-400">How Jasmine works, how we measure it, and what we ship.</p>

        <a href={`/blog/${lead.slug}`} className="group mt-14 grid overflow-hidden rounded-3xl border border-white/10 transition hover:border-white/20 md:grid-cols-2">
          <Cover seed={0} className="aspect-[16/10] md:aspect-auto" />
          <div className="flex flex-col justify-center gap-4 p-8 md:p-12">
            <Meta tag={lead.tag} date={lead.date} />
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white group-hover:text-[var(--leaf)]">{lead.title}</h2>
            <p className="text-zinc-400">{lead.summary}</p>
          </div>
        </a>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {rest.map((p, i) => (
            <a key={p.slug} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-3xl border border-white/10 transition hover:border-white/20">
              <Cover seed={i + 1} className="aspect-[16/7]" />
              <div className="space-y-3 p-7">
                <Meta tag={p.tag} date={p.date} />
                <h2 className="text-xl font-semibold tracking-tight text-white group-hover:text-[var(--leaf)]">{p.title}</h2>
                <p className="text-[15px] text-zinc-400">{p.summary}</p>
              </div>
            </a>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

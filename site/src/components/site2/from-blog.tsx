import { POSTS } from "@/content/blog";
import { Cover } from "@/app/blog/cover";
import { Meta } from "@/app/blog/meta";
import { Heading } from "./bits";

export function FromBlog() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Heading kicker="From the blog" title="How it works, in long form" />
        <a href="/blog" className="text-sm text-zinc-400 hover:text-white">All posts →</a>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {POSTS.map((p, i) => (
          <a key={p.slug} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-2xl border border-white/10 transition hover:-translate-y-1 hover:border-white/20">
            <Cover seed={i} className="aspect-[16/8]" />
            <div className="space-y-3 p-6">
              <Meta tag={p.tag} date={p.date} />
              <h3 className="font-medium leading-snug text-white group-hover:text-[var(--leaf)]">{p.title}</h3>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

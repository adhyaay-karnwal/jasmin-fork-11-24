import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav, Footer } from "@/components/site2/rest";
import { Prose } from "@/components/docs/prose";
import { POSTS, post } from "@/content/blog";
import { Cover } from "../cover";
import { Meta } from "../meta";

export const dynamicParams = false;
export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const p = post((await params).slug);
  return p ? { title: `${p.title} · Jasmine`, description: p.summary, openGraph: { title: p.title, description: p.summary, type: "article", images: ["/og.jpg"] }, twitter: { card: "summary_large_image", title: p.title, description: p.summary, images: ["/og.jpg"] } } : {};
}

export default async function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  const p = post((await params).slug);
  if (!p) notFound();
  const i = POSTS.indexOf(p);
  const others = POSTS.filter((o) => o !== p);
  return (
    <>
      <Nav />
      <main>
        <article className="mx-auto max-w-3xl px-6 pb-20 pt-16">
          <a href="/blog" className="text-sm text-zinc-500 hover:text-white">← All posts</a>
          <div className="mt-8"><Meta tag={p.tag} date={p.date} /></div>
          <h1 className="mt-4 text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-white">{p.title}</h1>
          <p className="mt-5 text-xl leading-relaxed text-zinc-400">{p.summary}</p>
          <p className="mt-6 text-sm text-zinc-500">By {p.author}</p>
          <Cover seed={i} className="mt-10 aspect-[16/7] rounded-2xl border border-white/10" />
          <div className="mt-6">
            <Prose>{p.body()}</Prose>
          </div>
        </article>
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto grid max-w-3xl gap-4 px-6 py-14 sm:grid-cols-2">
            {others.map((o) => (
              <a key={o.slug} href={`/blog/${o.slug}`} className="group rounded-2xl border border-white/10 p-6 transition hover:border-white/20">
                <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">{o.tag}</p>
                <p className="mt-2 font-medium text-white group-hover:text-[var(--leaf)]">{o.title}</p>
              </a>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hero } from "@/components/site2/hero";
import { Logos, Stats, Features, Sdk } from "@/components/site2/features";
import { Benchmarks } from "@/components/site2/benchmarks";
import { Nav, How, OpenSource, Faq, Cta, Footer } from "@/components/site2/rest";
import { AgentSetup, Reveal, Ticker } from "@/components/site2/extra";
import { FromBlog } from "@/components/site2/from-blog";

export default function Home() {
  const prompt = readFileSync(join(process.cwd(), "public/agent-setup.md"), "utf8");
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Logos />
        <Reveal><Stats /></Reveal>
        <Ticker />
        <Reveal><Features /></Reveal>
        <Reveal><Sdk /></Reveal>
        <Reveal><AgentSetup prompt={prompt} /></Reveal>
        <Benchmarks />
        <Reveal><How /></Reveal>
        <Reveal><OpenSource /></Reveal>
        <Reveal><FromBlog /></Reveal>
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

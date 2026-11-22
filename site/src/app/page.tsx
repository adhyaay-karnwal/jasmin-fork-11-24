import { Hero } from "@/components/site2/hero";
import { Logos, Stats, Features, Sdk } from "@/components/site2/features";
import { Benchmarks } from "@/components/site2/benchmarks";
import { Nav, How, OpenSource, Faq, Cta, Footer } from "@/components/site2/rest";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Logos />
        <Stats />
        <Features />
        <Sdk />
        <Benchmarks />
        <How />
        <OpenSource />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

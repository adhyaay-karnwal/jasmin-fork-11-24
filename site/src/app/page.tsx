import { Hero } from "@/components/v2/hero";
import { Leaderboard } from "@/components/v2/leaderboard";
import { HeadToHead, Ledger, Fairbench, Showcase, Lifecycle, Switches, Losses, Faq, Cta, Footer } from "@/components/v2/sections";
import { Reveal } from "@/components/v2/reveal";

export default function Home() {
  return (
    <main id="top">
      <Hero />
      <HeadToHead />
      <Leaderboard />
      <Ledger />
      <Fairbench />
      <Showcase />
      <Lifecycle />
      <Switches />
      <Losses />
      <Faq />
      <Cta />
      <Footer />
      <Reveal />
    </main>
  );
}

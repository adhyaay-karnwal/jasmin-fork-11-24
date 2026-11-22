import { Hero } from "@/components/site/hero";
import { FairbenchSection } from "@/components/site/fairbench-section";
import { AisandboxbenchSection, Features, Footer, HowItWorks, InstallSection } from "@/components/site/sections";

export default function Home() {
  return (
    <main className="flex flex-col">
      <Hero />
      <FairbenchSection />
      <Features />
      <InstallSection />
      <HowItWorks />
      <AisandboxbenchSection />
      <Footer />
    </main>
  );
}

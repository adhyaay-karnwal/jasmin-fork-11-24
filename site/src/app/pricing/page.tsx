import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site2/rest";
import { Heading } from "@/components/site2/bits";
import { Plans, Calculator, PricingFaq } from "./parts";

export const metadata: Metadata = {
  title: "Pricing · Jasmine",
  description: "Jasmine is free and open source to self-host. Jasmine Cloud bills per second for vCPU and memory.",
};

export default function Pricing() {
  return (
    <>
      <Nav />
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-12 pt-20 text-center">
          <Heading center kicker="Pricing" title={<>Free to own. Per second to rent.</>}>
            The engine is Apache-2.0 and the same everywhere. Run it on your own machines for nothing, or let us run it.
          </Heading>
        </section>
        <Plans />
        <Calculator />
        <PricingFaq />
      </main>
      <Footer />
    </>
  );
}

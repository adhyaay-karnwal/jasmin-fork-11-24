import type { ReactNode } from "react";
import { Nav, Footer } from "@/components/site2/rest";
import { DocsNav } from "./nav";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-24 md:h-[calc(100vh-8rem)] md:overflow-y-auto">
          <DocsNav />
        </aside>
        <article className="min-w-0 max-w-3xl pb-16">{children}</article>
      </div>
      <Footer />
    </>
  );
}

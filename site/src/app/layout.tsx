import type { Metadata } from "next";
import { Jost, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./jasmine.css";

const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["400", "500", "700"] });
// Monospace only inside real code and terminal fragments.
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jasmine: open-source sandboxes for AI agents",
  description:
    "Firecracker microVM sandboxes restored from memory snapshots: ready in 0.10 s, first on 12 of 25 metrics against 13 providers on aisandboxbench's harness. Self-hosted, Apache-2.0.",
  openGraph: {
    title: "Jasmine: open-source sandboxes for AI agents",
    description: "Ready in 0.10 s. First on 12 of 25 metrics against 13 providers. Self-hosted, Apache-2.0.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jost.variable} ${mono.variable}`}>
      <head>
        {/* Entrance animations only arm when scripts run; without JS everything is visible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./site.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://tryjasmine.dev"),
  title: "Jasmine: sandboxes for AI agents, ready in 100 ms",
  description:
    "Open-source Firecracker microVM sandboxes restored from memory snapshots. First on 12 of 25 metrics against 13 hosted providers on aisandboxbench's harness. Self-hosted, Apache-2.0.",
  openGraph: {
    title: "Jasmine: sandboxes for AI agents, ready in 100 ms",
    description: "Open-source Firecracker microVMs. First on 12 of 25 public benchmarks against 13 hosted providers.",
    url: "https://tryjasmine.dev",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Azami: open-source sandboxes for AI agents",
  description:
    "Every sandbox is its own Firecracker microVM, restored from a snapshot instead of booted. Self-host on any Linux box with KVM. Apache-2.0, measured in public.",
  openGraph: {
    title: "Azami: open-source sandboxes for AI agents",
    description: "Firecracker microVMs restored from snapshots. Self-hosted, Apache-2.0, measured in public.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground flex flex-col">{children}</body>
    </html>
  );
}

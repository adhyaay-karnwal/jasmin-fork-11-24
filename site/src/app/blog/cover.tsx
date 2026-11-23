"use client";

import { GrainGradient } from "@/components/grain-gradient";

const PALETTES: [string, string, ...string[]][] = [
  ["#0b0d0a", "#2c5a26", "#a6e86b", "#f0b7cc"],
  ["#0b0d0a", "#3a1f2c", "#f0b7cc", "#a6e86b"],
  ["#0b0d0a", "#16302a", "#5fd4b0", "#e9f7c8"],
];

/** A dithered gradient cover, one palette per post so each has its own colour. */
export function Cover({ seed, className = "" }: { seed: number; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#0b0d0a] ${className}`}>
      <GrainGradient
        colors={PALETTES[seed % PALETTES.length]}
        background="#0b0d0a"
        speed={0.25}
        grain={0.6}
        dither={{ enabled: true }}
        className="absolute inset-0 h-full w-full"
      />
      <svg viewBox="0 0 24 24" className="absolute bottom-5 left-5 size-7 text-white/85" aria-hidden>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="12" cy="6.2" rx="2.6" ry="5.2" fill="currentColor" transform={`rotate(${a} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="1.7" fill="#0b0d0a" />
      </svg>
    </div>
  );
}

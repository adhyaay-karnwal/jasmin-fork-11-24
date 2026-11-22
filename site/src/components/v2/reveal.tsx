"use client";

import { useEffect } from "react";

/** Arms the .reveal entrances: parts of a section rise in one after another as it enters. */
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const sibs = Array.from(el.parentElement?.querySelectorAll<HTMLElement>(":scope > .reveal") ?? []);
          el.style.setProperty("--d", `${Math.max(0, sibs.indexOf(el)) * 70}ms`);
          el.classList.add("is-in");
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

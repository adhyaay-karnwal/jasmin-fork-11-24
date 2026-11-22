// Medians with bootstrap 95% confidence intervals, and a conservative
// comparison: a system "wins" a metric only if its interval clears every other.

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

// Deterministic PRNG so a result file can be re-derived exactly from its samples.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapCI(xs, { iters = 2000, seed = 1 } = {}) {
  if (xs.length < 2) return [xs[0], xs[0]];
  const r = rng(seed);
  const meds = [];
  for (let i = 0; i < iters; i++) {
    const sample = Array.from({ length: xs.length }, () => xs[Math.floor(r() * xs.length)]);
    meds.push(median(sample));
  }
  return [quantile(meds, 0.025), quantile(meds, 0.975)];
}

export function summarize(xs) {
  if (!xs.length) return null;
  const [lo, hi] = bootstrapCI(xs);
  return { n: xs.length, median: median(xs), ci95: [lo, hi], p95: quantile(xs, 0.95), min: Math.min(...xs), max: Math.max(...xs) };
}

/** `better`: "lower" | "higher". Returns the winner's name, or null for a statistical tie. */
export function winner(bySystem, better) {
  const entries = Object.entries(bySystem).filter(([, s]) => s);
  if (entries.length < 2) return null;
  const lower = better === "lower";
  entries.sort((a, b) => (lower ? a[1].median - b[1].median : b[1].median - a[1].median));
  const [best, ...rest] = entries;
  const clears = rest.every(([, s]) => (lower ? best[1].ci95[1] < s.ci95[0] : best[1].ci95[0] > s.ci95[1]));
  return clears ? best[0] : null;
}

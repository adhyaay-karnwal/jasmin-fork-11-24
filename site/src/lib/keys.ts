"use client";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A new API key: `jsm_` + 40 base62 characters (~238 bits) from the browser's CSPRNG. */
export function newKey(): string {
  const out: string[] = [];
  // Rejection sampling keeps every character uniform.
  while (out.length < 40) {
    for (const b of crypto.getRandomValues(new Uint8Array(64))) {
      if (b < 248 && out.length < 40) out.push(ALPHABET[b % 62]);
    }
  }
  return `jsm_${out.join("")}`;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { DitherButton } from "@/components/dithercn/dither-button";
import { Card } from "@/components/site2/bits";
import { firebase } from "@/lib/firebase";
import { RATES, STD, stdHour, usd } from "../pricing/parts";

/** The Cloud gateway's public URL. Unset means Cloud isn't open yet: the dashboard keeps the early-access form. */
export const CLOUD_API = (process.env.NEXT_PUBLIC_CLOUD_API ?? "").replace(/\/$/, "");

export type CloudProfile = { plan?: string; suspended?: boolean; stripeCustomer?: string; limits?: { monthlySpendUsd?: number } };
type Usage = { cpuS?: number; gibS?: number; storageGibS?: number; usd?: number };

const month = () => new Date().toISOString().slice(0, 7);

async function billing(user: User, path: "checkout" | "portal"): Promise<string> {
  const r = await fetch(`${CLOUD_API}/billing/${path}`, { method: "POST", headers: { authorization: `Bearer ${await user.getIdToken()}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.url) throw new Error(body.error ?? `request failed (${r.status})`);
  return body.url;
}

export function useMonthUsage(uid: string) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => onSnapshot(doc(firebase().db, "usage", uid, "months", month()), (s) => setUsage((s.data() as Usage) ?? {}), () => setUsage({})), [uid]);
  return usage;
}

export function CloudPanel({ user, profile }: { user: User; profile: CloudProfile | null }) {
  const usage = useMonthUsage(user.uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const on = profile?.plan === "cloud";

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("cloud");
    if (q === "welcome") setNote("Cloud is on. Create a key above and point JASMINE_URL at the API below.");
    if (q === "cancelled") setNote("Checkout was cancelled. Nothing was charged.");
  }, []);

  async function go(path: "checkout" | "portal") {
    setBusy(true);
    setError("");
    try {
      window.location.assign(await billing(user, path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  const spent = usage?.usd ?? 0;
  const free = Math.min(spent, RATES.monthlyCredit);
  const cap = profile?.limits?.monthlySpendUsd ?? 100;

  return (
    <div id="cloud" className="scroll-mt-20">
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-white">Jasmine Cloud</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-500">
            {on
              ? "Hosted sandboxes on our hardware. Same API and SDKs as self-hosted."
              : `Hosted sandboxes, billed per second: ${usd(stdHour(), 3)} an hour for ${STD.vcpus} vCPU · ${STD.gib} GiB. No minimum, no fee per start, ${usd(RATES.monthlyCredit, 0)} free every month.`}
          </p>
        </div>
        {on ? (
          <button type="button" disabled={busy} onClick={() => go("portal")} className="text-sm text-zinc-400 hover:text-white disabled:opacity-50">
            Billing and invoices →
          </button>
        ) : (
          <DitherButton type="button" disabled={busy} onClick={() => go("checkout")}>
            {busy ? "Opening checkout…" : "Turn on Cloud"}
          </DitherButton>
        )}
      </div>
      {note && <p className="mt-4 rounded-lg border border-[var(--leaf)]/30 bg-[var(--leaf)]/10 px-4 py-3 text-sm text-[var(--leaf)]">{note}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-[var(--bud)]">{error}</p>}
      {profile?.suspended && (
        <p role="alert" className="mt-4 rounded-lg border border-[var(--bud)]/30 bg-[var(--bud)]/10 px-4 py-3 text-sm text-[var(--bud)]">
          A payment failed, so new sandboxes are blocked. Update your card under Billing and invoices.
        </p>
      )}

      {on && (
        <>
          <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 font-mono text-sm sm:grid-cols-4">
            {[
              ["this month", usd(spent)],
              ["free allowance used", `${usd(free)} / ${usd(RATES.monthlyCredit, 0)}`],
              ["vCPU-hours", ((usage?.cpuS ?? 0) / 3600).toFixed(1)],
              ["spend cap", usd(cap, 0)],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#0b0c0b] p-4">
                <p className="text-xs text-zinc-500">{k}</p>
                <p className="mt-1 text-lg tabular-nums text-white">{v}</p>
              </div>
            ))}
          </div>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-300">
            {`export JASMINE_URL=${CLOUD_API} JASMINE_API_KEY=jsm_…\ncurl -sX POST $JASMINE_URL/v1/sandboxes -H "authorization: Bearer $JASMINE_API_KEY"`}
          </pre>
          <p className="mt-3 text-xs text-zinc-500">
            Sandboxes stop after an hour unless you pass <code>timeout</code> (up to a day). At the spend cap, running sandboxes are paused, never deleted.
          </p>
        </>
      )}
    </Card>
    </div>
  );
}

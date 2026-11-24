"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Card } from "@/components/site2/bits";
import { firebase } from "@/lib/firebase";
import { RATES, STD, stdHour, usd } from "@/lib/pricing";

/** The Cloud gateway's public URL. Unset means Cloud isn't open yet: the dashboard keeps the early-access form. */
export const CLOUD_API = (process.env.NEXT_PUBLIC_CLOUD_API ?? "").replace(/\/$/, "");

/** Written only by the gateway (see firestore.rules). */
export type CloudProfile = { balanceUsd?: number; paid?: boolean; trialGranted?: boolean; suspended?: boolean };
type Usage = { cpuS?: number; gibS?: number; storageGibS?: number; usd?: number };

const month = () => new Date().toISOString().slice(0, 7);

export function useMonthUsage(uid: string) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => onSnapshot(doc(firebase().db, "usage", uid, "months", month()), (s) => setUsage((s.data() as Usage) ?? {}), () => setUsage({})), [uid]);
  return usage;
}

/** Balance shown to the user: an account that hasn't used Cloud yet still has its trial credit coming. */
export const balanceOf = (p: CloudProfile | null) => (p?.trialGranted ? (p.balanceUsd ?? 0) : RATES.trialCredit);

export function CloudPanel({ user, profile }: { user: User; profile: CloudProfile | null }) {
  const usage = useMonthUsage(user.uid);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const balance = balanceOf(profile);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("cloud");
    if (q === "paid") setNote("Payment received. Your credit shows up here within a few seconds.");
    if (q === "cancelled") setNote("Checkout was cancelled. Nothing was charged.");
  }, []);

  async function topUp(amount: number) {
    setBusy(amount);
    setError("");
    try {
      const r = await fetch(`${CLOUD_API}/billing/checkout`, {
        method: "POST",
        headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.url) throw new Error(body.error ?? `request failed (${r.status})`);
      window.location.assign(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(null);
    }
  }

  const hoursLeft = Math.max(0, balance) / stdHour();

  return (
    <div id="cloud" className="scroll-mt-20">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h2 className="text-lg font-medium text-white">Jasmine Cloud</h2>
            <p className="mt-1 max-w-xl text-sm text-zinc-500">
              {usd(stdHour(), 3)} an hour for {STD.vcpus} vCPU · {STD.gib} GiB, billed per second from prepaid credit. Credit never expires, and you can never owe more than you put in.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">balance</p>
            <p className={`text-3xl font-semibold tabular-nums tracking-tight ${balance > 0 ? "text-white" : "text-[var(--bud)]"}`}>{usd(balance)}</p>
            <p className="mt-1 text-xs text-zinc-500">≈ {hoursLeft >= 100 ? Math.round(hoursLeft).toLocaleString() : hoursLeft.toFixed(1)} hours of {STD.vcpus} vCPU · {STD.gib} GiB</p>
          </div>
        </div>

        {note && <p className="mt-4 rounded-lg border border-[var(--leaf)]/30 bg-[var(--leaf)]/10 px-4 py-3 text-sm text-[var(--leaf)]">{note}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-[var(--bud)]">{error}</p>}
        {balance <= 0 && (
          <p role="alert" className="mt-4 rounded-lg border border-[var(--bud)]/30 bg-[var(--bud)]/10 px-4 py-3 text-sm text-[var(--bud)]">
            Out of credit: new sandboxes are blocked and running ones are paused (nothing is deleted). Top up to carry on.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-400">Add credit</span>
          {RATES.topUps.map((a) => (
            <button
              key={a}
              type="button"
              disabled={busy !== null}
              onClick={() => topUp(a)}
              className="rounded-lg border border-white/15 px-4 py-2 font-mono text-sm text-white transition hover:border-[var(--leaf)]/60 hover:bg-[var(--leaf)]/10 disabled:opacity-50"
            >
              {busy === a ? "Opening…" : usd(a, 0)}
            </button>
          ))}
          {!profile?.paid && <span className="text-xs text-zinc-500">Trial accounts run 2 sandboxes at once; any top-up raises it to 20.</span>}
        </div>

        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 font-mono text-sm sm:grid-cols-3">
          {[
            ["used this month", usd(usage?.usd ?? 0)],
            ["vCPU-hours this month", ((usage?.cpuS ?? 0) / 3600).toFixed(1)],
            ["memory GiB-hours", ((usage?.gibS ?? 0) / 3600).toFixed(1)],
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
          Use any key from above. Sandboxes stop after an hour unless you pass <code>timeout</code> (up to a day).
        </p>
      </Card>
    </div>
  );
}

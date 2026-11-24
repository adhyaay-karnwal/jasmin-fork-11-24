"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signOut, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { DitherButton } from "@/components/dithercn/dither-button";
import { StatusDot } from "@/components/asciicn/status-dot";
import { Logo } from "@/components/site2/rest";
import { Card } from "@/components/site2/bits";
import { firebase } from "@/lib/firebase";
import { ensureProfile, useUser } from "@/lib/auth";
import { newKey, sha256Hex } from "@/lib/keys";
import { INSTALL } from "@/lib/jasmine-data";
import { CLOUD_API, CloudPanel, useMonthUsage, type CloudProfile } from "./cloud";

type Key = { id: string; name: string; prefix: string; createdAt: Timestamp | null };
type Access = { tier: "cloud" | "enterprise"; useCase: string; requestedAt: Timestamp | null };
type Profile = CloudProfile & { email: string; plan: string };

const MAX_KEYS = 10;

export default function Dashboard() {
  const user = useUser();

  useEffect(() => {
    if (user === null) window.location.replace("/login?next=/dashboard");
    if (user) ensureProfile(user).catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        <StatusDot status="busy" /> <span className="ml-2">Loading your account…</span>
      </main>
    );
  }
  return <Signed user={user} />;
}

function Signed({ user }: { user: User }) {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<Access | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    const { db } = firebase();
    const fail = () => setError("Couldn't load your account. Refresh to try again.");
    const offKeys = onSnapshot(
      query(collection(db, "users", user.uid, "keys"), orderBy("createdAt", "desc")),
      (s) => setKeys(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Key, "id">) }))),
      fail,
    );
    const offProfile = onSnapshot(doc(db, "users", user.uid), (s) => setProfile((s.data() as Profile) ?? null), fail);
    const offAccess = onSnapshot(doc(db, "access", user.uid), (s) => setAccess((s.data() as Access) ?? null), fail);
    return () => {
      offKeys();
      offProfile();
      offAccess();
    };
  }, [user.uid]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#070807]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-zinc-700">/</span>
            <span className="text-sm text-zinc-300">Dashboard</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/docs" className="hidden text-zinc-400 hover:text-white sm:block">Docs</a>
            <span className="hidden max-w-48 truncate text-zinc-500 md:block">{user.email}</span>
            <button type="button" className="text-zinc-400 hover:text-white" onClick={() => signOut(firebase().auth).then(() => window.location.replace("/"))}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white">
            Hi{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}.
          </h1>
          <p className="mt-2 text-zinc-400">Your keys, your plan, and the shortest path to a running sandbox.</p>
        </div>
        {error && <p role="alert" className="rounded-xl border border-[var(--bud)]/30 bg-[var(--bud)]/10 px-4 py-3 text-sm text-[var(--bud)]">{error}</p>}

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="p-6">
            <p className="text-sm text-zinc-500">Plan</p>
            <p className="mt-2 text-xl font-medium text-white">{profile?.plan === "cloud" ? "Cloud" : "Open source"}</p>
            <p className="mt-1 text-sm text-zinc-500">{profile?.plan === "cloud" ? "Usage-based." : "Self-hosted, free forever."}</p>
            <a href="/pricing" className="mt-4 inline-block text-sm text-[var(--leaf)] hover:underline">Compare plans →</a>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-zinc-500">API keys</p>
            <p className="mt-2 text-xl font-medium tabular-nums text-white">{keys ? keys.length : "–"}<span className="text-zinc-600"> / {MAX_KEYS}</span></p>
            <p className="mt-1 text-sm text-zinc-500">Shown once, stored as SHA-256 hashes.</p>
          </Card>
          {CLOUD_API ? (
            <CloudCard uid={user.uid} on={profile?.plan === "cloud"} />
          ) : (
          <Card className="p-6">
            <p className="text-sm text-zinc-500">Jasmine Cloud</p>
            <p className="mt-2 flex items-center gap-2 text-xl font-medium text-white">
              {access ? <><StatusDot status="busy" /> Requested</> : <><StatusDot status="offline" /> Early access</>}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {access ? `We'll email ${user.email} when your spot opens.` : "Hosted sandboxes, no servers to run."}
            </p>
          </Card>
          )}
        </div>

        <Keys uid={user.uid} keys={keys} />
        {CLOUD_API && <CloudPanel user={user} profile={profile} />}
        <Quickstart />
        {!CLOUD_API && access === null && (
          <div id="access" className="scroll-mt-20">
            <RequestAccess user={user} />
          </div>
        )}
      </main>
    </div>
  );
}

function Keys({ uid, keys }: { uid: string; keys: Key[] | null }) {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const full = (keys?.length ?? 0) >= MAX_KEYS;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const key = newKey();
      await addDoc(collection(firebase().db, "users", uid, "keys"), {
        name: name.trim() || "Untitled key",
        prefix: key.slice(0, 10),
        hash: await sha256Hex(key),
        createdAt: serverTimestamp(),
      });
      setFresh(key);
      setCopied(false);
      setName("");
    } catch {
      setError("Couldn't create the key. Try again.");
    }
    setBusy(false);
  }

  async function revoke(k: Key) {
    if (!confirm(`Revoke "${k.name}"? Anything using it stops working.`)) return;
    try {
      await deleteDoc(doc(firebase().db, "users", uid, "keys", k.id));
    } catch {
      setError("Couldn't revoke the key. Try again.");
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] p-6">
        <div>
          <h2 className="text-lg font-medium text-white">API keys</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Set one as <code className="text-zinc-300">JASMINE_API_KEY</code> on your host and in your agent. The daemon then requires it on every request.
          </p>
        </div>
        <form onSubmit={create} className="flex w-full gap-2 sm:w-auto">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="Key name, e.g. prod-agents"
            aria-label="Key name"
            className="h-9 min-w-0 flex-1 rounded-[9px] border border-white/12 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[var(--leaf)]/70 sm:w-56"
          />
          <DitherButton type="submit" size="sm" color="var(--leaf)" disabled={busy || full || !keys}>
            {busy ? "Creating…" : "Create key"}
          </DitherButton>
        </form>
      </div>

      {fresh && (
        <div className="border-b border-white/[0.06] bg-[var(--leaf)]/[0.06] p-6">
          <p className="text-sm font-medium text-white">Copy your new key now. You won&apos;t see it again.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[13px] text-[var(--leaf)]">{fresh}</code>
            <DitherButton
              size="sm"
              variant="outline"
              color="var(--leaf)"
              onClick={() => navigator.clipboard.writeText(fresh).then(() => setCopied(true))}
            >
              {copied ? "Copied" : "Copy"}
            </DitherButton>
            <button type="button" className="px-2 text-sm text-zinc-500 hover:text-white" onClick={() => setFresh(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="px-6 pt-4 text-sm text-[var(--bud)]">{error}</p>}
      {full && <p className="px-6 pt-4 text-sm text-zinc-500">You have {MAX_KEYS} keys, the maximum. Revoke one to make another.</p>}

      {keys === null ? (
        <p className="p-6 text-sm text-zinc-500">Loading keys…</p>
      ) : keys.length === 0 ? (
        <div className="p-10 text-center">
          <p className="font-mono text-2xl text-zinc-700">[ ]</p>
          <p className="mt-3 text-sm text-zinc-400">No keys yet. Name one above and press Create key.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{k.name}</p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {k.prefix}••••••••  ·  created {k.createdAt ? k.createdAt.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "just now"}
                </p>
              </div>
              <button type="button" onClick={() => revoke(k)} className="shrink-0 rounded-md px-2.5 py-1 text-sm text-zinc-500 transition hover:bg-[var(--bud)]/10 hover:text-[var(--bud)]">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CloudCard({ uid, on }: { uid: string; on: boolean }) {
  const usage = useMonthUsage(uid);
  return (
    <Card className="p-6">
      <p className="text-sm text-zinc-500">Jasmine Cloud</p>
      <p className="mt-2 flex items-center gap-2 text-xl font-medium text-white">
        <StatusDot status={on ? "online" : "offline"} /> {on ? "On" : "Off"}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        {on ? `$${(usage?.usd ?? 0).toFixed(2)} used this month.` : <a href="#cloud" className="text-[var(--leaf)] hover:underline">Turn it on below →</a>}
      </p>
    </Card>
  );
}

function Quickstart() {
  const steps: [string, string][] = [
    ["Install on a Linux host with /dev/kvm, then build a template", `${INSTALL}\nsudo jasmined build default python:3.12-slim`],
    ["Save your key and start the daemon", "sudo install -d -m 700 /etc/jasmine\necho JASMINE_API_KEY=jsm_… | sudo tee /etc/jasmine/env >/dev/null\nsudo systemctl enable --now jasmined   # API on :7171"],
    ["Point your agent at it (the SDKs read the same two variables)", 'export JASMINE_URL=http://your-host:7171 JASMINE_API_KEY=jsm_…\ncurl -sX POST $JASMINE_URL/v1/sandboxes -H "authorization: Bearer $JASMINE_API_KEY"'],
  ];
  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-white">Quickstart</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Three steps from an empty box to a sandbox. Using a coding agent? Paste the <a className="text-[var(--leaf)] hover:underline" href="/docs/agents">agent setup prompt</a> instead.
      </p>
      <ol className="mt-6 space-y-5">
        {steps.map(([t, c], i) => (
          <li key={t} className="grid gap-2 sm:grid-cols-[2rem_1fr]">
            <span className="flex size-7 items-center justify-center rounded-full border border-white/15 font-mono text-xs text-zinc-300">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm text-zinc-200">{t}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-300">{c}</pre>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RequestAccess({ user }: { user: User }) {
  const [tier, setTier] = useState<"cloud" | "enterprise">("cloud");
  const [useCase, setUseCase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(firebase().db, "access", user.uid), {
        email: user.email ?? "",
        tier,
        useCase: useCase.trim().slice(0, 2000),
        requestedAt: serverTimestamp(),
      });
    } catch {
      setError("Couldn't send the request. Try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-white">Request Jasmine Cloud</h2>
      <p className="mt-1 text-sm text-zinc-500">Hosted sandboxes on our hardware, billed per second. We&apos;re letting teams in in small batches.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="flex gap-2">
          {(["cloud", "enterprise"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tier === t}
              onClick={() => setTier(t)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${tier === t ? "border-[var(--leaf)]/60 bg-[var(--leaf)]/10 text-white" : "border-white/12 text-zinc-400 hover:text-white"}`}
            >
              {t === "cloud" ? "Cloud" : "Enterprise"}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-sm text-zinc-300">What will your agents run?</span>
          <textarea
            required
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. RL rollouts for a coding agent, about 2,000 sandboxes a day"
            className="mt-1.5 w-full rounded-[11px] border border-white/12 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[var(--leaf)]/70"
          />
        </label>
        {error && <p role="alert" className="text-sm text-[var(--bud)]">{error}</p>}
        <DitherButton type="submit" color="var(--leaf)" disabled={busy}>
          {busy ? "Sending…" : "Request access"}
        </DitherButton>
      </form>
    </Card>
  );
}

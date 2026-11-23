"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { GrainGradient } from "@/components/grain-gradient";
import { DitherButton } from "@/components/dithercn/dither-button";
import { Logo } from "@/components/site2/rest";
import { firebase } from "@/lib/firebase";
import { authMessage, ensureProfile, useUser } from "@/lib/auth";

type Mode = "signin" | "signup";

export default function Login() {
  const user = useUser();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setMode("signup");
  }, []);

  useEffect(() => {
    if (user) window.location.replace(next());
  }, [user]);

  async function done(u: User) {
    await ensureProfile(u);
    window.location.replace(next());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { auth } = firebase();
      const cred =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
      await done(cred.user);
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    try {
      const cred = await signInWithPopup(firebase().auth, new GoogleAuthProvider());
      await done(cred.user);
    } catch (err) {
      setError(authMessage(err));
    }
  }

  async function reset() {
    setError("");
    if (!email) return setError("Enter your email first, then press Forgot password.");
    try {
      await sendPasswordResetEmail(firebase().auth, email);
      setNote(`If there's an account for ${email}, a reset link is on its way.`);
    } catch (err) {
      setError(authMessage(err));
    }
  }

  const signup = mode === "signup";
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white">{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-zinc-400">
            {signup ? "API keys, your plan and Cloud early access, in one place." : "Sign in to manage your API keys."}
          </p>

          <button
            type="button"
            onClick={google}
            className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-[11px] border border-white/12 bg-white/[0.04] text-[15px] text-white transition hover:bg-white/[0.08]"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-zinc-600">
            <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={signup ? "new-password" : "current-password"}
              hint={signup ? "At least 6 characters." : undefined}
            />
            {error && <p role="alert" className="text-sm text-[var(--bud)]">{error}</p>}
            {note && <p className="text-sm text-[var(--leaf)]">{note}</p>}
            <DitherButton type="submit" size="lg" color="var(--leaf)" className="w-full" disabled={busy}>
              {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
            </DitherButton>
          </form>

          <div className="mt-6 flex justify-between text-sm text-zinc-500">
            <button type="button" className="hover:text-white" onClick={() => setMode(signup ? "signin" : "signup")}>
              {signup ? "Have an account? Sign in" : "New here? Create an account"}
            </button>
            {!signup && (
              <button type="button" className="hover:text-white" onClick={reset}>
                Forgot password
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-600">The open-source version needs no account. <a className="underline underline-offset-2" href="/docs">Self-host it</a>.</p>
      </section>

      <aside className="relative hidden overflow-hidden border-l border-white/[0.06] lg:block">
        <GrainGradient colors={["#0b0d0a", "#2c5a26", "#a6e86b", "#f0b7cc"]} background="#0b0d0a" speed={0.3} grain={0.55} dither={{ enabled: true }} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-x-12 bottom-12 font-mono text-[13px] leading-relaxed text-zinc-200/90">
          <p className="text-[var(--leaf)]">$ export JASMINE_API_KEY=jsm_••••••••</p>
          <p className="text-[var(--leaf)]">$ sudo -E jasmined serve</p>
          <p>jasmined listening on 127.0.0.1:7171</p>
          <p className="mt-3 text-[var(--leaf)]">$ node agent.mjs</p>
          <p>sandbox sbx_7f3a2c ready in 0.10s</p>
          <p>exec python3 -c &apos;print(6*7)&apos; → 42</p>
        </div>
      </aside>
    </main>
  );
}

function next() {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

function Field(props: { label: string; type: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{props.label}</span>
      <input
        required
        type={props.type}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1.5 h-11 w-full rounded-[11px] border border-white/12 bg-black/40 px-3.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-[var(--leaf)]/70 focus:ring-2 focus:ring-[var(--leaf)]/20"
      />
      {props.hint && <span className="mt-1 block text-xs text-zinc-500">{props.hint}</span>}
    </label>
  );
}

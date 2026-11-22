"use client";

import { TerminalWindow, type TerminalStep } from "@/components/asciicn/terminal-window";
import { ServerRack } from "@/components/asciicn/server-rack";
import { StatusDot } from "@/components/asciicn/status-dot";
import asb from "@/data/aisandboxbench.json";

const REPO = "https://github.com/arjunkshah12345-hash/azami";

const SCRIPT: TerminalStep[] = [
  { kind: "command", text: "curl -fsSL https://raw.githubusercontent.com/arjunkshah12345-hash/azami/master/install.sh | sudo sh" },
  { kind: "task", text: "firecracker, guest kernel, xfs reflink store", duration: 1.2, result: "ok", done: "host ready" },
  { kind: "command", text: "azamid build default python:3.12-slim" },
  { kind: "progress", label: "pull → ext4 → boot → snapshot", duration: 1.6 },
  { kind: "output", text: "template default ready (snapshot taken after boot)", tone: "ok" },
  { kind: "command", text: "systemctl enable --now azamid" },
  { kind: "command", text: "node agent.mjs" },
  { kind: "output", text: "sandbox sbx_9f3a… ready", tone: "info" },
  { kind: "output", text: "> python3 -c 'print(6*7)'" },
  { kind: "output", text: "42", tone: "ok" },
  { kind: "wait", duration: 2 },
];

const SDK = `import { Azami } from "azami-sdk";

await using sbx = await new Azami().create();
const r = await sbx.exec("python3 -c 'print(6*7)'");
console.log(r.stdout); // 42

const snap = await fetch(\`\${url}/v1/sandboxes/\${sbx.id}/snapshot\`, { method: "POST" });
// fork it: create as many sandboxes as you like from snap`;

export function InstallSection() {
  return (
    <section id="install" className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-24 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">install</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">One command on any KVM box.</h2>
        <p className="mt-4 max-w-lg text-muted-foreground">
          A static daemon and a 1 MB guest agent. No Kubernetes, no control plane to rent. Point it at a Hetzner box, a cloud VM with
          nested virtualization, or the Linux server under your desk.
        </p>
        <pre className="mt-8 overflow-x-auto border border-border bg-muted/30 p-5 font-mono text-[13px] leading-relaxed">{SDK}</pre>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          TypeScript and Python SDKs (no dependencies) · REST API · an adapter for{" "}
          <a className="underline underline-offset-4" href="https://github.com/opencoredev/sandbox-sdk">sandbox-sdk</a>
        </p>
      </div>
      <TerminalWindow title="~/azami — zsh" script={SCRIPT} rows={16} size="md" className="self-start" />
    </section>
  );
}

const FEATURES: [string, string][] = [
  ["Own kernel, own disk", "Every sandbox is a Firecracker microVM. Not a container sharing your host kernel."],
  ["Restored, not booted", "Templates are booted once and snapshotted. Creates restore memory lazily and clone the disk with an XFS reflink, so cost doesn't grow with image size."],
  ["Snapshot and fork live sandboxes", "Capture a running sandbox (processes, memory, files) and start any number of copies from it. Only dirty pages are written."],
  ["Pause to disk", "Suspend an idle sandbox to free its memory and CPU; exec and file calls resume it automatically with memory intact."],
  ["Preview URLs", "Any port inside a sandbox is reachable at /v1/sandboxes/:id/ports/:port, proxied over vsock. Dev servers just work."],
  ["Locked-down egress", "Internet access through NAT per sandbox, with the cloud metadata endpoint, the host and other sandboxes blocked."],
  ["No shared randomness", "Restoring one snapshot many times must not clone RNG state: Azami injects fresh entropy and the guest reseeds via VMGenID."],
  ["Verified on every push", "34 end-to-end checks against real microVMs in CI, including byte-exact memory after snapshot, fork and pause cycles."],
];

export function Features() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">what you get</p>
      <h2 className="mt-3 max-w-3xl text-3xl font-medium tracking-tight md:text-5xl">The parts agents actually need.</h2>
      <div className="mt-12 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="bg-background p-6">
            <StatusDot status="online" size="sm" showLabel={false} />
            <h3 className="mt-4 text-sm font-medium">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

type Row = { id: string; label: string; unit: string; azami: number; rank: number; of: number; best: { provider: string; median: number } };

export function AisandboxbenchSection() {
  const rows = (asb.rows as Row[]).slice().sort((a, b) => a.rank - b.rank);
  const f = (v: number, u: string) => (u === "s" ? `${v < 1 ? (v * 1000).toFixed(0) + " ms" : v.toFixed(2) + " s"}` : `${Math.round(v).toLocaleString()} ${u}`);
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">someone else&apos;s benchmark</p>
      <h2 className="mt-3 max-w-3xl text-3xl font-medium tracking-tight md:text-5xl">
        First on {asb.wins} of {asb.measured} metrics on aisandboxbench&apos;s own harness.
      </h2>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        We ran Azami through <a className="underline underline-offset-4" href="https://aisandboxbench.com">aisandboxbench.com</a>&apos;s
        open-source harness with its published flags, over the public internet, and ranked it against the 13 providers on its
        same-machine track. Self-run, not a listing: the client location and hardware differ from theirs, and the weak rows are
        included.
      </p>
      <div className="mt-10 overflow-x-auto border border-border">
        <table className="w-full min-w-[640px] text-left font-mono text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-3 font-normal">metric</th>
              <th className="p-3 font-normal">azami</th>
              <th className="p-3 font-normal">rank</th>
              <th className="p-3 font-normal">best published</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="p-3 text-muted-foreground">{r.label}</td>
                <td className={`p-3 ${r.rank === 1 ? "text-orange-400" : ""}`}>{f(r.azami, r.unit)}</td>
                <td className="p-3">{r.rank} of {r.of}</td>
                <td className="p-3 text-muted-foreground">{r.best.provider} {f(r.best.median, r.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    ["build", "An OCI image becomes an ext4 disk. Azami boots it once, warms the page cache with the image's binaries and runtimes, and snapshots memory + CPU state."],
    ["create", "A reflink clone of the disk (O(1)), a Firecracker process in a pre-built network namespace, and a lazy restore of the snapshot's memory. Fresh clock and entropy, then the agent answers."],
    ["run", "A 1 MB static agent is PID 1 inside the VM. Exec, files and port forwarding go over vsock in a binary protocol; no SSH, no shell server."],
    ["fork / pause", "Dirty pages since the last restore are written and merged onto a reflinked base, so snapshots and pauses cost what changed, not what's allocated."],
  ];
  return (
    <section id="how" className="mx-auto grid w-full max-w-6xl items-start gap-12 px-6 py-24 lg:grid-cols-[1fr_1.2fr]">
      <ServerRack units={10} activity={0.6} className="aspect-[3/4] w-full max-w-md" />
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">how it works</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-5xl">Boot once. Restore forever.</h2>
        <ol className="mt-10 space-y-8">
          {steps.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[2.5rem_1fr] gap-4">
              <span className="font-mono text-sm text-orange-400">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-mono text-sm">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12 text-sm text-muted-foreground md:flex-row md:justify-between">
        <div>
          <p className="font-mono text-foreground">azami</p>
          <p className="mt-2">Open-source sandboxes for AI agents. Apache-2.0.</p>
        </div>
        <div className="max-w-md">
          <p>
            Visuals built with <a className="underline underline-offset-4" href="https://gradients.sh">gradients.sh</a>,{" "}
            <a className="underline underline-offset-4" href="https://dithercn.dev">dithercn</a>,{" "}
            <a className="underline underline-offset-4" href="https://asciicn.dev">asciicn</a> and{" "}
            <a className="underline underline-offset-4" href="https://tripwire.sh/dither-kit">dither-kit</a>. Benchmarked with{" "}
            <a className="underline underline-offset-4" href="https://aisandboxbench.com">aisandboxbench</a>&apos;s harness by{" "}
            <a className="underline underline-offset-4" href="https://x.com/leodev">@leodev</a>.
          </p>
          <p className="mt-3"><a className="text-foreground underline underline-offset-4" href={REPO}>github.com/arjunkshah12345-hash/azami</a></p>
        </div>
      </div>
    </footer>
  );
}

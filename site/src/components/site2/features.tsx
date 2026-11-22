"use client";

import { useState } from "react";
import { DitherNumber } from "@/components/dithercn/dither-number";
import { ServerRack } from "@/components/asciicn/server-rack";
import { StatusDot } from "@/components/asciicn/status-dot";
import { ProgressBar } from "@/components/asciicn/progress-bar";
import { Loader } from "@/components/asciicn/loader";
import { LB, FB, metric, jasmineRow, fmt, headToHead } from "@/lib/jasmine-data";
import { Card, Heading } from "./bits";

const jr = (id: string) => jasmineRow(metric(id)).median!;

export function Logos() {
  const names = LB.providers.filter((p) => p.ranked && p.id !== "jasmine").map((p) => p.name);
  return (
    <section className="border-y border-white/[0.06] bg-black/30 py-10">
      <p className="text-center text-sm text-zinc-500">Benchmarked on one public harness against</p>
      <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6">
        {names.map((n) => (
          <span key={n} className="text-lg font-semibold tracking-tight text-zinc-500/90">
            {n}
          </span>
        ))}
      </div>
    </section>
  );
}

export function Stats() {
  const exec = FB.metrics.exec_ms.bySystem.jasmine!.median;
  const mem = FB.metrics.idle_mem_available_drop_per_sandbox_mib.bySystem.jasmine!.median;
  const items = [
    { v: Math.round(jr("cold") * 1000), suffix: " ms", d: 0, label: "Create to first command", note: "Best hosted provider: 376 ms" },
    { v: exec, suffix: " ms", d: 1, label: "Run a command", note: "Docker: 37 ms on the same machine" },
    { v: LB.wins, suffix: ` / ${LB.metrics.length}`, d: 0, label: "Public benchmarks ranked #1", note: `Top three on ${LB.podium}` },
    { v: mem, suffix: " MiB", d: 1, label: "Host memory per idle sandbox", note: "Clean pages shared across sandboxes" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="bg-[#0a0b0a] p-6 md:p-8">
            <DitherNumber
              value={s.v}
              suffix={s.suffix}
              size="md"
              color="var(--leaf)"
              trigger="in-view"
              format={{ minimumFractionDigits: s.d, maximumFractionDigits: s.d }}
              affixClassName="text-zinc-400 text-2xl"
            />
            <p className="mt-3 font-medium text-white">{s.label}</p>
            <p className="mt-1 text-sm text-zinc-500">{s.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ForkTree() {
  return (
    <div className="font-mono text-[12.5px] leading-6 text-zinc-400">
      <div className="text-zinc-200">
        <span className="text-[var(--leaf)]">●</span> sbx_7f3a2c <span className="text-zinc-500">running · step 41</span>
      </div>
      <div>└─ snapshot → snap_41c0 <span className="text-zinc-500">{fmt(jr("snapshot"), "s")}</span></div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="pl-6">
          {i === 3 ? "└─" : "├─"} sbx_90d{i} <span className="text-zinc-500">from snap_41c0 · {fmt(jr("create-from-snapshot"), "s")}</span>
        </div>
      ))}
    </div>
  );
}

function Blocked() {
  const rows = [
    ["169.254.169.254", "cloud metadata"],
    ["host services", "the machine running jasmined"],
    ["other sandboxes", "no east-west traffic"],
  ];
  return (
    <div className="space-y-2 text-[13px]">
      {rows.map(([a, b]) => (
        <div key={a} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <span className="font-mono text-zinc-300">{a}</span>
          <span className="flex items-center gap-2 text-zinc-500">
            {b} <StatusDot status="error" showLabel={false} size="sm" />
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2">
        <span className="font-mono text-zinc-300">pypi.org, github.com, …</span>
        <span className="flex items-center gap-2 text-zinc-500">
          internet via NAT <StatusDot status="online" showLabel={false} size="sm" />
        </span>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <Heading kicker="Built for agent loops" title="Everything an agent needs, nothing it has to wait for">
        Each sandbox is a real virtual machine with its own kernel, restored from a snapshot of a booted template, so it starts
        before your model finishes thinking.
      </Heading>
      <div className="mt-14 grid gap-4 md:grid-cols-6">
        <Card className="p-7 md:col-span-4">
          <h3 className="text-lg font-medium text-white">A kernel per sandbox</h3>
          <p className="mt-2 max-w-md text-zinc-400">
            Firecracker microVMs with about 5 MiB of VMM overhead. Code inside talks to its own guest kernel, never to the host&apos;s,
            unlike containers.
          </p>
          <div className="mt-6 h-44 overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <ServerRack units={8} activity={0.65} background="transparent" className="h-full w-full" />
          </div>
        </Card>
        <Card className="p-7 md:col-span-2">
          <h3 className="text-lg font-medium text-white">Pause with processes intact</h3>
          <p className="mt-2 text-zinc-400">Memory and running processes go to disk; the next call resumes them.</p>
          <div className="mt-8 space-y-5">
            <ProgressBar label="pause + resume" value={100} valueText={fmt(jr("pause-resume"), "s")} size="sm" color="green" />
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <Loader variant="dots" size="sm" showLabel={false} /> Ranked 1st of {metric("pause-resume").of} providers that support it
            </div>
          </div>
        </Card>
        <Card className="p-7 md:col-span-3">
          <h3 className="text-lg font-medium text-white">Snapshot and fork</h3>
          <p className="mt-2 text-zinc-400">Turn a running sandbox into a template and start copies from it.</p>
          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
            <ForkTree />
          </div>
        </Card>
        <Card className="p-7 md:col-span-3">
          <h3 className="text-lg font-medium text-white">Locked-down networking</h3>
          <p className="mt-2 text-zinc-400">One network namespace per sandbox. Checked on every push to the repo.</p>
          <div className="mt-6">
            <Blocked />
          </div>
        </Card>
        <Card className="p-7 md:col-span-2">
          <h3 className="text-lg font-medium text-white">Preview URLs</h3>
          <p className="mt-2 text-zinc-400">Any port inside the sandbox, proxied over vsock. No public IP per sandbox.</p>
          <div className="mt-6 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-zinc-300">
            /v1/sandboxes/sbx_7f3a2c/ports/3000/
          </div>
          <p className="mt-3 text-sm text-zinc-500">First byte {fmt(jr("preview-first-byte"), "s")}, 1st of {metric("preview-first-byte").of}</p>
        </Card>
        <Card className="p-7 md:col-span-2">
          <h3 className="text-lg font-medium text-white">Fresh randomness per copy</h3>
          <p className="mt-2 text-zinc-400">
            Each restore injects host entropy and reseeds via VMGenID, so copies of one snapshot never share RNG state.
          </p>
        </Card>
        <Card className="p-7 md:col-span-2">
          <h3 className="text-lg font-medium text-white">Any OCI image</h3>
          <p className="mt-2 text-zinc-400">
            <code className="font-mono text-[13px] text-zinc-300">jasmined build</code> boots an image once, warms its page cache and
            snapshots it. Pick vCPUs and memory per template.
          </p>
        </Card>
      </div>
    </section>
  );
}

const TABS = [
  {
    name: "TypeScript",
    file: "agent.ts",
    code: `import { Jasmine } from "jasmine-sdk";

const jasmine = new Jasmine();             // http://127.0.0.1:7171
await using sbx = await jasmine.create();  // ready in ~100 ms

await sbx.files.write("/workspace/main.py", "print(6 * 7)");
const r = await sbx.exec("python3 /workspace/main.py");
console.log(r.stdout);                     // 42

await sbx.pause();                         // processes kept
const snap = await sbx.snapshot();         // becomes a template
const fork = await jasmine.create({ template: snap.name });`,
  },
  {
    name: "Python",
    file: "agent.py",
    code: `from jasmine_sdk import Jasmine

jasmine = Jasmine()
with jasmine.create() as sbx:
    sbx.write_file("/workspace/main.py", "print(6 * 7)")
    print(sbx.exec("python3 /workspace/main.py").stdout)   # 42

    sbx.pause()
    snap = sbx.snapshot()
    with jasmine.create(template=snap["name"]) as fork:
        print(fork.exec("ls /workspace").stdout)`,
  },
  {
    name: "HTTP",
    file: "shell",
    code: `curl -X POST :7171/v1/sandboxes -H 'content-type: application/json' -d '{}'
# {"id":"sbx_7f3a2c…","template":"default","timings":{…}}

curl -X POST :7171/v1/sandboxes/$ID/exec -H 'content-type: application/json' \\
     -d '{"cmd":"python3 -c \\"print(6*7)\\""}'
# {"stdout":"42\\n","exit_code":0,"duration_ms":4.1,…}

curl -X PUT  ":7171/v1/sandboxes/$ID/files?path=/workspace/a.txt" --data-binary @a.txt
curl -X POST :7171/v1/sandboxes/$ID/pause      # or resume, snapshot
curl -X DELETE :7171/v1/sandboxes/$ID`,
  },
];

export function Sdk() {
  const [tab, setTab] = useState(0);
  return (
    <section id="sdk" className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <Heading kicker="SDKs" title="From zero to a running VM">
          Zero-dependency TypeScript, standard-library Python, or plain HTTP. The sandbox deletes itself when the block ends.
        </Heading>
        <ul className="mt-8 space-y-3 text-zinc-300">
          {["sdk/typescript · zero dependencies", "sdk/python · standard library only", "Bearer auth via JASMINE_API_KEY"].map((x) => (
            <li key={x} className="flex items-center gap-3">
              <span className="text-[var(--leaf)]">✓</span>
              <code className="font-mono text-[14px]">{x}</code>
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e0c]">
        <div className="flex items-center gap-1 border-b border-white/10 px-2 py-2">
          {TABS.map((t, i) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setTab(i)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${i === tab ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t.name}
            </button>
          ))}
          <span className="ml-auto pr-2 font-mono text-[12px] text-zinc-600">{TABS[tab].file}</span>
        </div>
        <pre className="overflow-x-auto p-5 text-[13px] leading-6 text-zinc-300">
          <code>{TABS[tab].code}</code>
        </pre>
      </div>
    </section>
  );
}

export function HeadToHeadGrid() {
  const rows = headToHead();
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((p) => (
        <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="truncate text-sm text-zinc-400">vs {p.name}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {p.ahead}
            <span className="text-base font-normal text-zinc-500"> / {p.shared}</span>
          </p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[var(--leaf)]" style={{ width: `${(p.ahead / p.shared) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

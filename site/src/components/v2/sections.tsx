"use client";

import { useState } from "react";
import { BarChart } from "@/components/dithercn/bar-chart";
import { GrainGradient } from "@/components/grain-gradient";
import { CopyCommand } from "@/components/v2/copy-command";
import {
  LB, FB, FAIR_LABELS, SYSTEM_NAMES, CREDITS, INSTALL, REPO,
  headToHead, metric, jasmineRow, fmt, img,
} from "@/lib/jasmine-data";

/* ---------- proof: head to head against each provider ---------- */
export function HeadToHead() {
  const rows = headToHead();
  return (
    <section className="h2h" aria-labelledby="h2h-h">
      <div className="h2h-board">
        <div className="tile tile-accent reveal">
          <h2 id="h2h-h">Head to head, one harness</h2>
          <p>Metrics where Jasmine&apos;s median beats each provider&apos;s, out of the metrics both have.</p>
        </div>
        {rows.map((p) => (
          <div className="tile reveal" key={p.id}>
            <span className="tile-name">{p.name}</span>
            <span className="tile-score">
              <b>{p.ahead}</b> of {p.shared}
            </span>
          </div>
        ))}
        <figure className="tile tile-photo">
          <img src={img("jasminum-sambac-in-china.jpg")} alt="Arabian jasmine, white flowers and buds among glossy leaves" width={1600} height={1466} loading="lazy" />
        </figure>
        <figure className="tile tile-photo only-tablet">
          <img src={img("jasminum-polyanthum-3.jpg")} alt="Pink jasmine buds opening into white star flowers" width={1200} height={1600} loading="lazy" />
        </figure>
      </div>
    </section>
  );
}

/* ---------- stats: ledger aligned on the decimal ---------- */
function split(v: string) {
  const [w, d] = v.split(".");
  return [w, d != null ? `.${d}` : ""];
}
export function Ledger() {
  const cold = jasmineRow(metric("cold")).median!;
  const pause = jasmineRow(metric("pause-resume")).median!;
  const replay = jasmineRow(metric("tool-replay")).median!;
  const exec = FB.metrics.exec_ms.bySystem.jasmine!.median;
  const mem = FB.metrics.idle_mem_available_drop_per_sandbox_mib.bySystem.jasmine!.median;
  const rows: [string, string][] = [
    [cold.toFixed(2), "seconds from create to a finished first command; the best hosted provider took 0.38"],
    [exec.toFixed(1), "milliseconds to run a command in a live sandbox, against 28 to 37 for gVisor, Kata and Docker"],
    [replay.toFixed(1), "seconds for a 100-call agent tool replay; the best hosted provider took 10.9"],
    [pause.toFixed(2), "seconds to pause and resume with every process still running"],
    [mem.toFixed(1), "MiB of host memory per idle sandbox, because clean pages are shared"],
  ];
  return (
    <section className="ledger" aria-labelledby="ledger-h">
      <h2 id="ledger-h" className="reveal">
        <span className="soft">Fast where agents</span>
        <br />
        spend their time
      </h2>
      <dl className="ledger-rows">
        {rows.map(([v, cap]) => {
          const [w, d] = split(v);
          return (
            <div className="ledger-row reveal" key={cap}>
              <dt className="sr-only">{cap}</dt>
              <dd className="ledger-w">{w}</dd>
              <dd className="ledger-d">{d}</dd>
              <dd className="ledger-cap">{cap}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/* ---------- fairbench: same machine as Docker, gVisor, Kata ---------- */
const FAIR_ORDER = [
  "ready_ms", "exec_ms", "agent_trace_ms", "exec_under_neighbor_load_ms", "destroy_ms",
  "burst_1_all_ready_ms", "burst_5_all_ready_ms", "burst_10_all_ready_ms", "burst_25_all_ready_ms",
  "idle_mem_available_drop_per_sandbox_mib", "idle_mem_used_per_sandbox_mib",
  "files_1k_ms", "files_16m_ms", "compute_ms", "small_fsync_ms", "big_write_ms", "task_python_ms", "task_node_build_ms",
];
const SYS = ["jasmine", "docker", "gvisor", "kata"];
export function Fairbench() {
  const [sel, setSel] = useState("agent_trace_ms");
  const m = FB.metrics[sel];
  const unit = FAIR_LABELS[sel]?.unit ?? "ms";
  const data = SYS.map((s) => ({ system: SYSTEM_NAMES[s], value: m.bySystem[s]?.median ?? 0 }));
  const wins = FAIR_ORDER.filter((k) => FB.metrics[k]?.winner === "jasmine").length;
  const losses = FAIR_ORDER.filter((k) => FB.metrics[k]?.winner && FB.metrics[k].winner !== "jasmine").length;
  return (
    <section className="fair" id="fairbench" aria-labelledby="fair-h">
      <div className="fair-head">
        <h2 id="fair-h" className="reveal">Same machine as Docker, gVisor and Kata</h2>
        <p className="reveal">
          fairbench puts all four on one host with the same <code>{FB.limits.image}</code> image and {FB.limits.cpu} vCPU /{" "}
          {FB.limits.memoryMb / 1024} GiB each, in {FB.rounds} interleaved rounds of random order, with an agent workload generated
          from a seed picked at run time (seed {FB.seed}). A system wins only when its 95% confidence interval clears every
          other&apos;s. Jasmine wins {wins} of {FAIR_ORDER.length}, Docker {losses}, the rest are ties. Docker shares the host kernel;
          the other three don&apos;t.
        </p>
      </div>
      <div className="fair-body">
        <div className="fair-table-wrap reveal">
          <table className="fair-table">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                {SYS.map((s) => (
                  <th scope="col" key={s}>{SYSTEM_NAMES[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FAIR_ORDER.filter((k) => FB.metrics[k]).map((k) => {
                const r = FB.metrics[k];
                const u = FAIR_LABELS[k]?.unit ?? "ms";
                return (
                  <tr key={k} className={k === sel ? "is-on" : undefined} onMouseEnter={() => setSel(k)} onClick={() => setSel(k)}>
                    <th scope="row">
                      <button type="button" onFocus={() => setSel(k)}>{FAIR_LABELS[k]?.label ?? k}</button>
                    </th>
                    {SYS.map((s) => (
                      <td key={s} className={r.winner === s ? "is-win" : undefined}>
                        {fmt(r.bySystem[s]?.median ?? null, u)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <figure className="fair-chart reveal" data-ui>
          <figcaption>
            <b>{FAIR_LABELS[sel]?.label}</b>
            <span>
              median {unit}, lower is better · {m.winner ? `${SYSTEM_NAMES[m.winner]} wins` : "tie: intervals overlap"}
            </span>
          </figcaption>
          <BarChart
            data={data}
            x="system"
            series={[{ label: `median ${unit}`, value: "value", color: "green" }]}
            height={260}
            highlight={0}
            format={(v: number) => fmt(v, unit)}
          />
          <p className="fair-note">
            Host: {FB.host.cpu}, {FB.host.cpus} CPUs, {FB.host.memGiB} GiB, a GitHub Actions runner with nested virtualization,
            which taxes the two microVMs (Jasmine, Kata) more than bare metal would.
          </p>
        </figure>
      </div>
    </section>
  );
}

/* ---------- showcase: the API, panel by panel, on a dark field ---------- */
const PANELS = [
  {
    name: "TypeScript",
    lines: "Zero dependencies. The sandbox closes itself when the block ends.",
    code: `import { Jasmine } from "jasmine-sdk";

await using sbx = await new Jasmine().create();
const r = await sbx.exec("python3 -c 'print(6*7)'");
console.log(r.stdout); // 42`,
  },
  {
    name: "Python",
    lines: "Standard library only. Same calls, same shapes.",
    code: `from jasmine_sdk import Jasmine

with Jasmine().create() as sbx:
    sbx.write_file("/workspace/a.py", "print(6*7)")
    print(sbx.exec("python3 /workspace/a.py").stdout)`,
  },
  {
    name: "Pause and fork",
    lines: "Pause keeps memory and processes. A snapshot becomes a template you can start from.",
    code: `const jasmine = new Jasmine();
const sbx = await jasmine.create();
await sbx.pause();            // suspended to disk
await sbx.exec("uptime");     // resumes on its own
const t = await sbx.snapshot();
const copy = await jasmine.create({ template: t.name });`,
  },
  {
    name: "Preview URLs",
    lines: "Any port inside the sandbox, proxied over vsock. No public IP per sandbox.",
    code: `await sbx.exec("setsid npm run dev -- --port 3000 &");
const url = sbx.previewUrl(3000);
// http://127.0.0.1:7171/v1/sandboxes/sbx_.../ports/3000/
await fetch(url);`,
  },
  {
    name: "Plain HTTP",
    lines: "Everything the SDKs do is a small REST API on the host.",
    code: `POST   /v1/sandboxes            {template, cpu, memory_mib, env, labels}
POST   /v1/sandboxes/{id}/exec  {cmd, stdin, timeout_ms}
PUT    /v1/sandboxes/{id}/files?path=
POST   /v1/sandboxes/{id}/pause | resume | snapshot
DELETE /v1/sandboxes/{id}`,
  },
];
export function Showcase() {
  const [i, setI] = useState(0);
  return (
    <section className="show" aria-labelledby="show-h">
      <div className="show-field" aria-hidden>
        <GrainGradient colors={["#1d2219", "#3b4734", "#5c6b54", "#7a2848"]} background="#161815" speed={0.25} grain={0.35} blur={0.6} />
      </div>
      <h2 id="show-h" className="sr-only">The API</h2>
      <div
        className="show-row"
        onScroll={(e) => {
          const el = e.currentTarget;
          const w = el.scrollWidth / PANELS.length;
          setI(Math.min(PANELS.length - 1, Math.max(0, Math.round(el.scrollLeft / w))));
        }}
      >
        {PANELS.map((p, k) => (
          <article className={`panel${k === i ? " is-lit" : ""}`} key={p.name} data-ui>
            <div className="panel-bar">{p.name}</div>
            <pre><code>{p.code}</code></pre>
          </article>
        ))}
      </div>
      <div className="show-text" aria-live="polite">
        <p className="show-name">{PANELS[i].name}</p>
        <p>{PANELS[i].lines}</p>
        <p className="show-hint">Scroll the row sideways · {i + 1} of {PANELS.length}</p>
      </div>
    </section>
  );
}

/* ---------- how it works: one sandbox, four fields ---------- */
export function Lifecycle() {
  const cold = jasmineRow(metric("cold")).median!;
  const exec = FB.metrics.exec_ms.bySystem.jasmine!.median;
  const pause = jasmineRow(metric("pause-resume")).median!;
  const del = jasmineRow(metric("destroy")).median!;
  const steps = [
    { clause: "First a snapshot is cloned, not booted.", state: "restoring", rows: [["rootfs", "reflink of template"], ["memory", "mapped from snapshot"], ["entropy", "fresh from host"]] },
    { clause: "Then it runs whatever the agent asks.", state: "running", rows: [["first command", fmt(cold, "s")], ["each command", fmt(exec, "ms")], ["network", "own namespace, NAT"]] },
    { clause: "Then it sleeps with its processes intact.", state: "paused", rows: [["pause + resume", fmt(pause, "s")], ["written to disk", "dirty pages only"], ["wakes on", "next request"]] },
    { clause: "Finally it's gone, and so is everything in it.", state: "deleted", rows: [["destroy", fmt(del, "s")], ["disk", "clone removed"], ["slot", "recycled"]] },
  ];
  return (
    <section className="life" id="how" aria-labelledby="life-h">
      {steps.map((s, i) => (
        <div className={`life-field f${i}`} key={s.state}>
          {i === 0 && <h2 id="life-h">How a sandbox lives</h2>}
          <div className="life-card reveal" data-ui>
            <div className="life-card-top">
              <span>sbx_7f3a2c</span>
              <span className={`pill s-${s.state}`}>{s.state}</span>
            </div>
            {s.rows.map(([k, v]) => (
              <div className="life-kv" key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
          <p className="life-clause">{s.clause}</p>
        </div>
      ))}
    </section>
  );
}

/* ---------- features: sentences with switches ---------- */
const SWITCHES = [
  { s: "Give every sandbox its own kernel.", c: "A Firecracker microVM per sandbox, about 5 MiB of VMM overhead. Docker shares the host kernel; Jasmine doesn't.", on: true },
  { s: "Keep the cloud metadata endpoint away.", c: "169.254.0.0/16, the host and other sandboxes are dropped by the host firewall, checked on every push.", on: true },
  { s: "No two copies share randomness.", c: "Each restore injects fresh entropy and reseeds via VMGenID, so copies of one snapshot never share RNG state.", on: false },
  { s: "Pay nothing per sandbox-hour.", c: "Apache-2.0, one static binary, any Linux box with KVM. Your cost is the machine.", on: false },
];
export function Switches() {
  const [on, setOn] = useState(SWITCHES.map((x) => x.on));
  return (
    <section className="sw" aria-label="What Jasmine does for you">
      {SWITCHES.map((x, i) => (
        <div className={`sw-band b${i}${on[i] ? " is-on" : ""}`} key={x.s}>
          <div className="sw-text">
            <p className="sw-s">{x.s}</p>
            {on[i] && <p className="sw-c">{x.c}</p>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on[i]}
            aria-label={x.s}
            className="toggle"
            data-ui
            onClick={() => setOn((v) => v.map((b, k) => (k === i ? !b : b)))}
          >
            <span />
          </button>
        </div>
      ))}
    </section>
  );
}

/* ---------- the name, and where Jasmine loses ---------- */
export function Losses() {
  const losses = LB.metrics.filter((m) => m.jasmineRank && m.jasmineRank > 3).sort((a, b) => b.jasmineRank! - a.jasmineRank!);
  return (
    <section className="loss" aria-labelledby="loss-h">
      <figure className="loss-photo">
        <img src={img("mhnt-jasminum-polyanthum-flowers-and-buds.jpg")} alt="Three white jasmine flowers among closed pink buds" width={1600} height={1341} loading="lazy" />
      </figure>
      <div className="loss-text">
        <h2 id="loss-h" className="reveal">Where it loses, plainly</h2>
        <p className="reveal">
          Every metric where Jasmine ranks below third on the same harness. Raw throughput is where a VM pays its tax, and the
          nested virtualization on this runner makes that tax larger than it would be on bare metal.
        </p>
        <ul className="loss-list">
          {losses.map((m) => (
            <li key={m.id} className="reveal">
              <span>{m.label}</span>
              <b>
                {m.jasmineRank} of {m.of}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- faq: question index, one answer ---------- */
const FAQ = [
  ["Is it production ready?", "It's v0.1.0. Everything on this page passes a 32-check end-to-end suite on real Firecracker on every push, but it runs on one host today: no multi-host scheduler yet, and running sandboxes don't survive a daemon restart."],
  ["What do I need to run it?", "A Linux machine with /dev/kvm: a bare-metal server, or a cloud VM with nested virtualization. The installer brings Firecracker, the guest kernel and an XFS reflink store. x86_64 and arm64."],
  ["Can I use my own image?", "Any OCI image: jasmined build turns it into a template by booting it once and snapshotting it. Templates can have their own vCPU and memory sizes."],
  ["How is this compared fairly?", "Two ways. On aisandboxbench's open-source harness, with its published flags, against its published results. And on fairbench, which puts Docker, gVisor and Kata on the same machine as Jasmine with the same image and limits, a held-out workload and confidence intervals."],
  ["Why not just use Docker?", "Containers share the host kernel, so one kernel bug is everyone's problem. Jasmine gives each sandbox its own kernel and still creates it faster than Docker does on the same machine."],
  ["What does it cost?", "Nothing per sandbox. It's Apache-2.0 and self-hosted; you pay for the machine. A hosted version doesn't exist yet."],
];
export function Faq() {
  const [q, setQ] = useState(0);
  return (
    <section className="faq" aria-labelledby="faq-h">
      <div className="faq-list">
        <h2 id="faq-h" className="faq-h">Fair questions</h2>
        {FAQ.map(([question, answer], i) => (
          <div key={question} className="faq-item">
            <button
              type="button"
              className={i === q ? "is-on" : undefined}
              aria-expanded={i === q}
              onClick={() => setQ(i)}
              onMouseEnter={() => setQ(i)}
              onFocus={() => setQ(i)}
            >
              {question}
            </button>
            <p className="faq-inline">{i === q ? answer : null}</p>
          </div>
        ))}
      </div>
      <div className="faq-pane" aria-live="polite">
        <p key={q}>{FAQ[q][1]}</p>
      </div>
    </section>
  );
}

/* ---------- cta + footer ---------- */
export function Cta() {
  return (
    <section className="cta" id="install" aria-labelledby="cta-h">
      <div className="cta-flank cta-photo">
        <img src={img("jasminum-sambac-kz01.jpg")} alt="Arabian jasmine flowers opening from green bracts" width={1600} height={1142} loading="lazy" />
      </div>
      <div className="cta-tile">
        <h2 id="cta-h">Run it on your own box</h2>
        <p>One command on a Linux host with KVM, then turn any OCI image into a template. Apache-2.0.</p>
        <CopyCommand command={INSTALL} />
        <div className="cta-links">
          <a className="btn btn-ink" href={REPO}>Read the code on GitHub</a>
        </div>
      </div>
      <div className="cta-flank cta-field" />
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <figure className="foot-photo">
        <img src={img("jasminum-polyanthum-kz02.jpg")} alt="A wall of pink jasmine in full flower" width={1600} height={1066} loading="lazy" />
      </figure>
      <div className="foot-line">
        <span>Jasmine, open-source agent sandboxes</span>
        <span className="foot-links">
          <a href={REPO}>GitHub</a>
          <a href={`${REPO}/tree/master/bench/fair`}>fairbench</a>
          <a href={`${REPO}/blob/master/SECURITY.md`}>Security</a>
          <a href={`${REPO}/blob/master/LICENSE`}>Apache-2.0</a>
        </span>
        <span>2026</span>
      </div>
      <p className="foot-credits">
        Photographs:{" "}
        {CREDITS.map((c, i) => (
          <span key={c.file}>
            <a href={c.page}>{c.title}</a> by {c.creator ?? "unknown"}, <a href={c.licenseUrl}>{c.license}</a>
            {i < CREDITS.length - 1 ? "; " : "."}
          </span>
        ))}{" "}
        Site built with gradients.sh, dithercn, dither-kit and asciicn, after the sites of @leodev.
      </p>
    </footer>
  );
}

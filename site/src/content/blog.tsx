import type { ReactNode } from "react";
import { REPO, INSTALL } from "@/lib/jasmine-data";

export type Post = {
  slug: string;
  title: string;
  date: string;
  author: string;
  tag: string;
  summary: string;
  body: () => ReactNode;
};

const Pre = ({ children }: { children: string }) => (
  <pre className="my-6 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-5 font-mono text-[12.5px] leading-relaxed text-zinc-300">
    {children.replace(/^\n/, "").replace(/\n\s*$/, "")}
  </pre>
);

export const POSTS: Post[] = [
  {
    slug: "introducing-jasmine",
    title: "Introducing Jasmine",
    date: "2026-11-23",
    author: "The Jasmine team",
    tag: "Launch",
    summary: "Open-source microVM sandboxes for AI agents, ready in 100 ms, measured in public against everyone else.",
    body: () => (
      <>
        <p>
          Agents write code, and that code has to run somewhere that isn&apos;t your laptop or your production database. Sandbox providers have
          multiplied this year, and so have the benchmarks comparing them. Almost every one of those providers is closed, hosted only, or both.
        </p>
        <p>
          Today we&apos;re releasing <strong>Jasmine</strong>: an Apache-2.0 sandbox runtime you can install on any Linux machine with KVM. Every
          sandbox is a Firecracker microVM with its own kernel, and every one is restored from a memory snapshot rather than booted, so it&apos;s
          ready for its first command in about 100 ms.
        </p>
        <video className="my-8 w-full rounded-xl border border-white/10" controls playsInline preload="metadata" poster="/og.jpg">
          <source src="/launch.mp4" type="video/mp4" />
        </video>
        <h2>The numbers</h2>
        <p>
          We ran aisandboxbench&apos;s own open-source harness, with the flags from its collection plan, and compared against the 13 hosted providers
          it publishes. Jasmine&apos;s median ranked first on <strong>12 of 25 metrics</strong>: cold start (0.10 s against a best of 0.38 s),
          agent tool replay (4.3 s against 10.9 s), pause and resume (0.42 s against 0.73 s), and starting from a snapshot (0.10 s against 0.55 s),
          among others. There were zero failures across about 2,700 observations.
        </p>
        <p>
          Those are self-run results, not a listing on aisandboxbench.com, and the hardware differs, so we built a second benchmark,{" "}
          <a href={`${REPO}/tree/master/bench/fair`}>fairbench</a>, that runs Jasmine, Docker, gVisor and Kata Containers on the same machine
          with the same image and limits. Jasmine created a sandbox and ran its first command in 87 ms (Docker: 174 ms), ran commands in 4.1 ms
          (Docker: 37 ms) and finished a held-out agent trace in 673 ms (Docker: 1,273 ms).
        </p>
        <h2>Where we lose</h2>
        <p>
          Docker wins raw CPU and disk throughput, because it shares the host kernel and pays no VM tax. On aisandboxbench, Jasmine is 11th at
          npm install and 12th of 14 at memory bandwidth and disk writes. Those losses are on the{" "}
          <a href="/#benchmarks">homepage</a>, next to the wins.
        </p>
        <h2>What you can do with it</h2>
        <ul>
          <li>Run model-generated code in a real VM, with internet access but no route to your cloud metadata, host services or other sandboxes.</li>
          <li>Pause a sandbox between agent turns, so it uses no CPU and keeps all its state.</li>
          <li>Snapshot a sandbox and start copies of it, to branch an agent&apos;s work or fan out RL rollouts.</li>
          <li>Open any port inside a sandbox through a preview URL.</li>
        </ul>
        <Pre>{INSTALL}</Pre>
        <p>
          Or paste our <a href="/docs/agents">agent setup prompt</a> into your coding agent and let it do the setup. Jasmine Cloud, the same engine
          run by us, is in early access: <a href="/pricing">request a spot</a>.
        </p>
      </>
    ),
  },
  {
    slug: "how-a-sandbox-starts-in-100ms",
    title: "100 milliseconds: how a Jasmine sandbox starts",
    date: "2026-11-23",
    author: "The Jasmine team",
    tag: "Engineering",
    summary: "Snapshots instead of boots, reflinks instead of copies, and a PID 1 that does almost nothing. Where the time goes and where it went.",
    body: () => (
      <>
        <p>
          The fastest way to boot a Linux VM is not to. A Jasmine sandbox never runs a bootloader, a kernel&apos;s init path or a service manager. It
          resumes from a moment when all of that had already happened.
        </p>
        <h2>1. Build once</h2>
        <p>
          <code>jasmined build</code> unpacks an OCI image to an ext4 disk with no journal, boots it once in Firecracker with our agent as PID 1, and
          snapshots the VM&apos;s memory and CPU state. That snapshot is the template.
        </p>
        <h2>2. Copy nothing</h2>
        <p>
          On create, the template disk is cloned with an XFS reflink, which takes the same time for a 50 MB image as for a 5 GB one. The snapshot
          memory is mapped <code>MAP_PRIVATE</code>, so pages load only when the guest touches them and clean pages are shared across every sandbox
          through the host page cache.
        </p>
        <h2>3. Nothing to boot</h2>
        <p>
          PID 1 is <code>jasmine-agent</code>, a small static Rust binary with no async runtime. It mounts the basics, reaps zombies and serves
          requests over virtio-vsock: one connection per request, framed binary messages, raw bytes for output and files. No SSH handshake, no JSON
          on the hot path.
        </p>
        <h2>4. Don&apos;t be the same machine twice</h2>
        <p>
          Restoring one snapshot into many VMs has a sharp edge: they all wake with the same RNG state and the same clock. On every restore the host
          sets the guest clock and injects fresh entropy, and VMGenID triggers the kernel to reseed. An end-to-end test checks that two sandboxes from
          one snapshot never produce the same random bytes.
        </p>
        <h2>The first command was slow, until it wasn&apos;t</h2>
        <p>
          Early on, the sandbox was ready in under 40 ms, but its first command took about as long again. Profiling ruled out host page faults: the
          time went to cold disk reads of libc and the binary itself. So the template build now reads the image&apos;s binaries, libraries and runtimes
          into the guest page cache before the snapshot is taken. That halved first-exec time, from 40 ms to 19 ms, and the prewarm is on by default.
        </p>
        <h2>Networking without a single <code>ip</code> call</h2>
        <p>
          Every snapshot has its network config baked in, so every sandbox expects the same <code>tap0</code> and guest IP. Each one gets its own
          network namespace holding that identical tap, NATed to a unique veth. The namespaces are pre-built in a pool and recycled on delete, so
          the create path never shells out to <code>ip</code> or <code>iptables</code>. Adding networking cost nothing measurable.
        </p>
        <h2>What&apos;s next</h2>
        <p>
          Under bursts of concurrent creates, restored guests spend their first milliseconds taking EPT faults on 4 KiB pages. Backing guest memory
          with 2 MiB huge pages through a userfaultfd restore handler should cut those faults about 512×. That and forking a running sandbox are next
          on the <a href={`${REPO}#roadmap`}>roadmap</a>.
        </p>
      </>
    ),
  },
  {
    slug: "benchmarking-sandboxes-honestly",
    title: "How we benchmark, and why we publish our losses",
    date: "2026-11-22",
    author: "The Jasmine team",
    tag: "Benchmarks",
    summary: "Client-side timing, same workloads, confidence intervals, a held-out trace, and every losing metric on the homepage.",
    body: () => (
      <>
        <p>
          Every sandbox company has a chart where it wins. Here are the rules we hold our own charts to.
        </p>
        <h2>Measure from the client</h2>
        <p>
          Times are wall-clock, measured by the caller through the public API. Server-reported timings flatter everyone, because they leave out the
          parts users actually wait for.
        </p>
        <h2>Same machine, or say so</h2>
        <p>
          fairbench runs Jasmine, Docker (runc), gVisor and Kata on one host, with the same <code>node:22-bookworm</code> image and 2 vCPU / 4 GiB
          each, in interleaved, randomly ordered rounds. When we compare against hosted providers, we use the benchmark owner&apos;s harness and flags,
          label the results as self-run and list how the setup differs.
        </p>
        <h2>Don&apos;t tune to the test</h2>
        <p>
          fairbench&apos;s agent workload is generated from a seed chosen at run time, so nobody can optimize for a fixed script. The held-out agent
          trace is 40 operations we never looked at while tuning.
        </p>
        <h2>Ties are ties</h2>
        <p>
          We report medians with bootstrap 95% confidence intervals. A system wins a metric only if its interval clears every other system&apos;s.
          Otherwise it&apos;s a tie, even if our median is lower.
        </p>
        <h2>Publish the losses</h2>
        <p>
          On fairbench, Jasmine wins 9 of 18 metrics, mostly lifecycle and agent-loop latency, and loses CPU-bound Python, small fsync&apos;d files and
          a Vite build to Docker. Our CI runner uses nested virtualization, which makes the VM tax bigger for Jasmine and Kata than it would be on
          bare metal. All of that is on the homepage, and the raw data is in the{" "}
          <a href={`${REPO}/tree/master/results`}>repo</a>.
        </p>
      </>
    ),
  },
];

export const post = (slug: string) => POSTS.find((p) => p.slug === slug);
export const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

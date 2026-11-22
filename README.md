# Warren

Open-source sandboxes for AI agents: hardware-isolated microVMs that create, fork and resume in milliseconds,
run on any Linux box with KVM, and are measured in public against everyone else.

Apache-2.0. Status: early but working end to end. Sandboxes boot, run commands, move files, reach the internet,
and pass the full correctness suite on every push (CI runs real Firecracker on KVM runners).

## Quick start (Linux host with KVM)

```sh
sudo dev/setup-host.sh                    # firecracker, guest kernel, crane, XFS reflink data dir
cargo build --release -p warrend
cargo build --release -p warren-agent --target x86_64-unknown-linux-musl
sudo install -D target/x86_64-unknown-linux-musl/release/warren-agent /usr/local/lib/warren/warren-agent
sudo target/release/warrend build default python:3.12-slim   # any OCI image
sudo target/release/warrend serve                              # http://127.0.0.1:7171
```

```ts
import { Warren } from "@warren/sdk";                      // sdk/typescript, zero deps
await using sbx = await new Warren().create();
console.log((await sbx.exec("python3 -c 'print(6*7)'")).stdout);
```

```python
from warren import Warren                                  # sdk/python, stdlib only
with Warren().create() as sbx:
    print(sbx.exec("pip install -q requests && echo ok").stdout)
```

API: `POST /v1/sandboxes`, `POST /v1/sandboxes/{id}/exec`, `GET|PUT /v1/sandboxes/{id}/files?path=`,
`DELETE /v1/sandboxes/{id}`, `GET|POST /v1/templates`. Optional bearer auth via `WARREN_API_KEY`.

## Results on aisandboxbench's harness

Warren was measured with [aisandboxbench.com](https://aisandboxbench.com)'s own open-source harness
(`opencoredev/sandbox-sdk`) on its same-machine track (4 vCPU / 8 GB), with the flags from its collection plan,
over the public internet. Against the 13 providers published there on 2026-11-21, Warren's median ranks
**first on 12 of 25 metrics**:

- **Start-up:** cold start (0.094 s vs 0.376 s best), run a command, reconnect.
- **Agent work:** agent tool replay (4.3 s vs 10.9 s), git clone, dev server ready, preview URL first byte,
  edit loop, 10 MB file round trip.
- **Pause and snapshots:** pause + resume (0.42 s vs 0.73 s), take snapshot, start from snapshot (0.10 s vs 0.55 s).

It is weaker on 25-at-once bursts (7th–9th), npm install (11th), memory bandwidth and disk write (12th of 14).
There were 0 failures across about 2,700 observations, including 210 burst creates.

**These are self-run results, not an aisandboxbench.com listing.** The client location (Iowa via a Cloudflare
tunnel vs their Florida server) and the hardware (one nested-virtualization CI runner vs production fleets)
differ. Full table, caveats and raw data: [`results/aisandboxbench-2026-11-21.md`](results/aisandboxbench-2026-11-21.md).
To reproduce, see [`integrations/sandbox-sdk`](integrations/sandbox-sdk).

## What is verified on every push

Exec (stdout/stderr/exit code, stdin, env, cwd, timeout kills the whole process tree, background jobs
don't hang), binary file round trip and modes, per-sandbox disk isolation, no shared RNG state between
sandboxes restored from one snapshot (host-injected entropy plus VMGenID reseed), guest clock sync after
restore, DNS + HTTPS + `pip install` from inside the sandbox, cloud metadata endpoint blocked, host
services blocked, no sandbox-to-sandbox traffic, and both SDKs.

## Design

| Layer | Choice | Why |
|---|---|---|
| Isolation | Firecracker microVM per sandbox | Real kernel boundary, ~5 MiB VMM overhead, snapshot support |
| Create | Restore from a memory snapshot of a booted template, never cold-boot | Create time stays flat regardless of what the image does at boot |
| Memory | Snapshot memory mapped `MAP_PRIVATE` (lazy, page-cache shared); userfaultfd later | Resume cost is independent of RAM size; N sandboxes share clean pages |
| Disk | Per-sandbox rootfs is an XFS reflink of the template | Copy-on-write, so create and fork are O(1) in image size |
| Guest | `warren-agent` is PID 1: no systemd, no shell, static binary | Nothing to boot; one vsock round trip to first command |
| Host↔guest | Binary framed protocol over virtio-vsock, one request per connection | Raw bytes for output and files, no JSON/base64 on the hot path |
| Snapshot safety | Each restore sets the guest clock and injects fresh entropy (`RNDADDENTROPY`) | Sandboxes restored from one snapshot never share RNG state |
| Per-VM paths | Firecracker runs with cwd in the sandbox dir; snapshot paths are relative | One snapshot restores into many sandboxes at once without path collisions |
| Network | One network namespace per sandbox holding the same `tap0`/guest IP; NAT to a unique veth; namespaces pre-built and recycled | Snapshot-baked network config works for every restore; no `ip`/`iptables` calls on the create path |
| Disk format | ext4 without a journal, mounted `noatime` | Sandbox disks are ephemeral: running sandboxes don't survive a daemon restart and paused ones are synced before their snapshot, so a journal adds write amplification and fsync latency without adding safety |
| Page cache | Template build reads the image's binaries, libraries and runtimes into the guest page cache before snapshotting | First command doesn't pay cold disk reads; pages are shared across sandboxes via the host page cache |

## Roadmap

1. ~~**Core.**~~ Done: template build (OCI image → ext4 → boot → snapshot); create, exec, files, delete and networking over HTTP; TypeScript and Python SDKs; cross-provider benchmark harness.
2. **Performance.** 2 MiB huge pages with a userfaultfd restore handler, to cut post-restore EPT faults about 512×, which is what concurrency currently pays for. Also jailer + cgroups per VM, and bare-metal benchmark runs.
3. **Agent features.** Fork a *running* sandbox into N copies, PTY, streaming exec, per-sandbox egress allowlists, and a secrets proxy that adds API keys to outbound requests so keys never enter the VM.
4. **Fleet.** Multi-host scheduler, lazily pulled images, persistent volumes, and GPU support via Cloud Hypervisor.
5. **Compatibility.** An E2B-compatible API and an MCP server.

## Benchmark rules (`bench/`)

"Best" means best on a harness anyone can rerun against any provider, Warren included. These rules exist to keep it honest:

- **Measured from the client** over the public API, from a VM in the same region as the provider. Wall-clock times, never server-reported numbers.
- **Same workload for every provider**, scripted once and run through thin adapters. No provider-specific tuning beyond what its public docs recommend to every user.
- **Default images.** Each provider uses its standard Python image, and we report image size.
- **Warm and cold reported separately.** Warren's warm pool counts as warm. The headline number is the cold, first-ever create after the template was built.
- **Distributions, not best runs.** At least 200 samples per metric, with p50, p95, p99, max and error rate. Raw data is published.
- **Real work alongside micro-benchmarks:** `pip install` and `numpy` work, `git clone` plus a test suite, a 1 GB file write and read, and 100- and 1000-sandbox concurrency bursts.
- **Cost:** $ per sandbox-hour at list price, plus density (sandboxes per host) for self-hosted.
- **Isolation is listed next to speed.** Containers and microVMs are labeled, not ranked together silently.

`bench/compare/run.mjs` implements this: Warren, E2B and Daytona adapters using each provider's official SDK,
identical workloads (first command, warm exec, 1 MiB file round trip, Python hello, numpy, `pip install
requests`, 256 MiB fsync'd disk write), and the measured API round trip printed next to every provider.
Providers without credentials are skipped, never estimated. In CI, add `E2B_API_KEY` / `DAYTONA_API_KEY`
as repository secrets.

Until Warren runs on a remote host in the same region as the client, its numbers have no network round trip
while the hosted providers' do. The harness prints that RTT so readers can account for it. A headline
comparison will only be published from a setup where every provider is remote.

## Layout

```
crates/proto    host↔guest wire protocol (framing + message types)
crates/agent    guest PID 1: mounts, reaping, exec/files/ping/sync over vsock
crates/warrend  host daemon + CLI: Firecracker lifecycle, templates, network slots, HTTP API
sdk/typescript  TypeScript SDK (zero dependencies)
sdk/python      Python SDK (stdlib only)
bench/          e2e correctness suite + micro-benchmarks, concurrency probe, cross-provider harness
dev/            host setup script; Lima config for a local KVM VM (Apple M3+ / macOS 15+)
```

## Developing on a Mac

Firecracker needs Linux and KVM. On an Apple M3 or newer with macOS 15+, `limactl start --name=sbx dev/lima-kvm.yaml`
gives you a Linux VM with nested KVM (needs about 15 GB free). Anywhere else, use a Linux box with `/dev/kvm`,
for example a Hetzner bare-metal server.

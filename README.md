# Warren

Open-source sandboxes for AI agents: hardware-isolated microVMs that create, fork and resume in milliseconds,
run on any Linux box with KVM, and are measured in public against everyone else.

Apache-2.0. Status: early. The guest agent and wire protocol are written; the host daemon is next.

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
| Per-VM paths | Firecracker runs with cwd in the sandbox dir; snapshot paths are relative; one netns per VM with the same tap name | One snapshot restores into many sandboxes at once without path or tap collisions |

## Roadmap

1. **Core.** `warrend`: template build (OCI image → ext4 → boot → snapshot); create, exec, files and delete over HTTP; TypeScript and Python SDKs.
2. **Agent features.** Fork a *running* sandbox into N copies, PTY, streaming exec, per-sandbox egress allowlists, and a secrets proxy that adds API keys to outbound requests so keys never enter the VM.
3. **Fleet.** Multi-host scheduler, lazily pulled images, persistent volumes, and GPU support via Cloud Hypervisor.
4. **Compatibility.** An E2B-compatible API and an MCP server.

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

Metrics: create → first command, exec round trip, snapshot/resume, fork into 1/10/100 copies, file throughput,
concurrency p99, and the four realistic workloads above.

## Layout

```
crates/proto    host↔guest wire protocol (framing + message types)
crates/agent    guest PID 1: mounts, reaping, exec/files/ping/sync over vsock
crates/warrend  host daemon + CLI (next)
sdk/typescript  client SDK (next)
bench/          provider-neutral benchmark harness (next)
dev/            local dev host: Lima VM with nested KVM (Apple M3+ / macOS 15+)
```

## Developing on a Mac

Firecracker needs Linux and KVM. On an Apple M3 or newer with macOS 15+, `limactl start --name=sbx dev/lima-kvm.yaml`
gives you a Linux VM with nested KVM (needs about 15 GB free). Anywhere else, use a Linux box with `/dev/kvm`,
for example a Hetzner bare-metal server.

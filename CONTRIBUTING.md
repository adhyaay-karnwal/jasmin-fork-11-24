# Contributing

Thanks for helping. The short version: **measure before and after, and keep the tests honest.**

## Layout

| path | what |
|---|---|
| `crates/warrend` | host daemon: Firecracker lifecycle, templates, snapshots, networking, HTTP API |
| `crates/agent` | guest agent (PID 1 inside every VM), static musl binary |
| `crates/proto` | host ↔ guest wire protocol |
| `sdk/` | TypeScript and Python SDKs |
| `bench/warren-e2e.mjs` | end-to-end correctness checks (run on every push against real microVMs) |
| `bench/fair` | fairbench: same-host comparison with Docker, gVisor and Kata |
| `integrations/sandbox-sdk` | adapter for aisandboxbench's harness |
| `site/` | website |

## Developing

You need Linux with `/dev/kvm`. On a Mac with an M3 or later, `dev/lima-kvm.yaml` gives you a VM with nested KVM.
Otherwise use any Linux box or cloud VM with nested virtualization.

```sh
sudo dev/setup-host.sh
cargo build --release -p warrend
cargo build --release -p warren-agent --target x86_64-unknown-linux-musl
sudo install -D target/x86_64-unknown-linux-musl/release/warren-agent /usr/local/lib/warren/warren-agent
sudo target/release/warrend build default python:3.12-slim && sudo target/release/warrend serve
node bench/warren-e2e.mjs
```

CI (`.github/workflows/e2e.yml`) runs all of this on GitHub's KVM runners for every push.

## Rules for performance changes

- Show numbers from a run where the before and after builds were measured **on the same host, in the same run**.
  Run-to-run variance on shared CI runners is larger than most real effects. `fairbench.yml` has a `warren_ref`
  input for A/B builds.
- Don't tune for a benchmark's exact commands. fairbench's agent trace is generated from a run-time seed for this
  reason.
- Correctness first: a change to snapshots, pause or memory handling must keep the byte-exact memory checks in
  `bench/warren-e2e.mjs` passing.

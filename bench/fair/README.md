# fairbench

A sandbox benchmark built to be **apples to apples** and **hard to overfit**. The rules below were written
before the first result existed and are versioned as `fairbench-1`. Changing any of them requires a new
version, and results from different versions are never compared.

## Rules

1. **One host, one client.** Every system runs on the same machine, behind the same client process, over
   local sockets: Docker's Engine API over its unix socket (no CLI process per call) and warrend over
   localhost HTTP. There's no network distance and no hardware difference between systems.
2. **Same work, same limits.** Same OCI image (`node:22-bookworm`), same CPU and memory limit (default
   2 vCPU / 4096 MiB), and the same commands for every system.
3. **Interleaved rounds.** Each round runs every system once, in a fresh random order, so host drift,
   caches and thermal effects don't favor whoever runs first or last.
4. **Held-out workload.** The agent trace (40 file writes, reads, `ls`/`grep`/`sed`/`sha256sum`, and Python
   and Node one-liners) is generated from a seed chosen when the run starts. The seed is printed and
   stored, so a run can be reproduced but not tuned for in advance. Within a round every system gets
   the same trace.
5. **Real work and real costs,** not just latency. Workloads include a pinned repo's test suite, a
   production frontend build, CPU-bound and fsync-heavy disk work, concurrency up to 25, host memory per
   idle sandbox, and exec latency while neighbors burn CPU.
6. **Equal-footing definitions.** "Ready" means create → first command *finished*, for everyone. A
   system's `create` call may return earlier or later; that doesn't matter here.
7. **No composite score, honest ties.** Each metric reports a median with a bootstrap 95% CI. A system
   wins a metric only if its CI clears every other system's; otherwise the metric is a tie. Every
   sample and every failure is kept in the output.
8. **Isolation is a label, not a score.** The report shows whether each system runs its own kernel.
   Containers sharing the host kernel aren't the same product as microVMs, so read speed next to
   isolation.

## Systems

| name | what | isolation |
|---|---|---|
| `warren` | this repo | Firecracker microVM, own kernel |
| `docker` | Docker + runc | container, shares host kernel |
| `gvisor` | Docker + runsc | user-space kernel (gVisor) |
| `kata` | Docker + Kata Containers (QEMU) | microVM, own kernel |

Hosted providers can't share hardware with these, so they're out of scope for fairbench by design (see
`bench/compare` and `integrations/sandbox-sdk` for those).

## Workloads (fairbench-1)

| metric | what is timed |
|---|---|
| `ready_ms` | create + first `true` finished |
| `exec_ms` | median of 5 `true` execs in a live sandbox |
| `files_1k_ms`, `files_16m_ms` | write then read back and verify, through the system's file API |
| `compute_ms` | pure-Python sieve of primes below 3,000,000 |
| `small_fsync_ms` | 500 × 4 KiB files, each fsync'd (git/npm-style metadata I/O) |
| `big_write_ms` | 512 MiB sequential write with fsync (all systems store data on the same disk and filesystem: native XFS on the runner's scratch SSD) |
| `agent_trace_ms` | the held-out 40-op trace |
| `task_python_ms` | `git clone` simplejson v3.19.3 + its stdlib test suite |
| `task_node_build_ms` | upload a Vite + React app, `npm ci`, `vite build` |
| `destroy_ms` | destroy call |
| `burst_K_all_ready_ms` | K sandboxes created at once, until all have finished a command (K = 1, 5, 10, 25) |
| `idle_mem_available_drop_per_sandbox_mib`, `idle_mem_used_per_sandbox_mib` | host memory per idle sandbox (20 sandboxes, caches dropped, median of 3 readings): `MemAvailable` drop, and `MemTotal - MemFree` growth |
| `exec_under_neighbor_load_ms` | `true` latency in one sandbox while 3 neighbors saturate their CPUs |

Heavy tasks run in the first `--heavy-rounds` rounds; everything else runs every round.

## Run

```sh
sudo -E node bench/fair/run.mjs --systems warren,docker,gvisor,kata --rounds 15 --out fairbench.json
```

The CI workflow `.github/workflows/fairbench.yml` installs gVisor and Kata, builds Warren, and runs everything
on one GitHub Actions runner. Systems that fail to install are listed as unavailable, never silently dropped.

The Vite fixture is copied from opencoredev/sandbox-sdk (MIT); see `fixtures/vite-react/NOTICE`.

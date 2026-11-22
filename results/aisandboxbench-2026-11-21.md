# Azami on aisandboxbench's harness: 2026-11-21

> Recorded before the project was renamed from Warren to Azami. Raw data files still use the old name `warren`.

Harness: opencoredev/sandbox-sdk @ b23a99b, unmodified timing code, Azami adapter from `integrations/sandbox-sdk`.
Flags mirror its `collection-plan.sh`: same-machine track (4 vCPU / 8 GB), main suite 100 runs (30 for workloads), snapshot suite 30, bursts 10/25 x 3 cohorts.
Client: GitHub Actions runner (Azure, Des Moines, Iowa) -> Cloudflare quick tunnel -> azamid on the same runner (AMD EPYC, 4 vCPU, 16 GB, nested virtualization).
Published comparison: aisandboxbench.com/results.json, same-machine track, fetched 2026-11-21 (client: a server in Florida).

| metric (same machine, 4 vCPU / 8 GB) | Azami median | Azami rank | published best | Azami sample |
|---|---|---|---|---|
| Cold start | **0.0944 s** | 1 of 14 | Modal 0.376 | 30 runs, 0 failed |
| Agent tool replay | **4.3 s** | 1 of 14 | Beam 10.9 | 30 runs, 0 failed |
| npm install | **1.38 s** | 11 of 14 | Daytona 0.747 | 30 runs, 0 failed |
| pip install | **4.36 s** | 9 of 14 | Luxor 3.33 | 30 runs, 0 failed |
| git clone | **0.419 s** | 1 of 14 | Vercel Sandbox 0.431 | 30 runs, 0 failed |
| Dev server ready | **0.513 s** | 1 of 14 | Modal 0.895 | 30 runs, 0 failed |
| Preview URL first byte | **0.141 s** | 1 of 14 | Vercel Sandbox 0.145 | 30 runs, 0 failed |
| Edit, rebuild, reload | **0.182 s** | 1 of 14 | Beam 0.205 | 30 runs, 0 failed |
| Run a command | **0.0281 s** | 1 of 14 | Beam 0.065 | 100 runs, 0 failed |
| Write + read 1 KB | **0.128 s** | 3 of 14 | Superserve 0.097 | 100 runs, 0 failed |
| Write + read 10 MB | **0.444 s** | 1 of 14 | Superserve 0.664 | 100 runs, 0 failed |
| Reconnect | **0.153 s** | 1 of 14 | Modal 0.189 | 100 runs, 0 failed |
| Destroy | **0.039 s** | 2 of 14 | Beam 0.036 | 30 runs, 0 failed |
| Pause + resume | **0.42 s** | 1 of 7 | Freestyle 0.725 | 100 runs, 0 failed |
| Take snapshot | **0.193 s** | 1 of 11 | Superserve 0.385 | 30 runs, 0 failed |
| Start from snapshot | **0.104 s** | 1 of 11 | Superserve 0.546 | 30 runs, 0 failed |
| 10 at once, all ready | **0.556 s** | 2 of 13 | Modal 0.42 | 3 runs, 0 failed |
| 25 at once, all ready | **1.25 s** | 7 of 13 | Modal 0.622 | 3 runs, 0 failed |
| CPU, one core | **19,167,725 ops/s** | 3 of 14 | Instabox 20,129,332 | 100 runs, 0 failed |
| CPU, all cores | **30,649,847 ops/s** | 10 of 14 | Instabox 53,922,716 | 100 runs, 0 failed |
| Memory bandwidth | **14,155 MB/s** | 12 of 14 | Luxor 45,886 | 100 runs, 0 failed |
| Disk write | **241 MB/s** | 12 of 14 | Modal 8,275 | 100 runs, 0 failed |
| Disk read | **6,083 MB/s** | 10 of 14 | Upstash Ephemeral Box 23,093 | 100 runs, 0 failed |
| 4K random write | **12,552 IOPS** | 9 of 14 | Baseten 480,361 | 100 runs, 0 failed |
| 4K random read | **600,201 IOPS** | 4 of 14 | Boat 796,399 | 100 runs, 0 failed |

Azami ranks first on 12 of 25 metrics it was measured on.

| provider | cold start | run a command | cold - 2 x command (network-adjusted) |
|---|---|---|---|
| Vercel Sandbox | 0.517 s | 0.336 s | -0.155 s |
| **Azami** | 0.094 s | 0.028 s | 0.038 s |
| Upstash Ephemeral Box | 0.684 s | 0.308 s | 0.068 s |
| Superserve | 0.520 s | 0.188 s | 0.144 s |
| Modal | 0.376 s | 0.077 s | 0.222 s |
| Beam | 0.413 s | 0.065 s | 0.283 s |
| Baseten | 0.695 s | 0.178 s | 0.339 s |
| Freestyle | 0.693 s | 0.160 s | 0.373 s |
| boxd | 0.548 s | 0.064 s | 0.420 s |
| Boat | 1.125 s | 0.335 s | 0.455 s |
| E2B | 0.793 s | 0.134 s | 0.525 s |
| Luxor | 1.089 s | 0.183 s | 0.723 s |
| Daytona | 1.250 s | 0.134 s | 0.982 s |
| Instabox | 1.850 s | 0.196 s | 1.458 s |
| Upstash Box | 2.684 s | 0.325 s | 2.034 s |

Burst suite run twice (0 failures in 210 creates); the table uses the first run. Second run: 10 at once 0.833 s, 25 at once 1.763 s (rank 9 of 13).

## Caveats

- **Client location differs.** The published numbers are timed from a server in Florida to each provider's
  region. Azami's are timed from the GitHub runner through a Cloudflare tunnel; the tunnel adds roughly
  25 ms per call, but that is not the same network path. `compare.py` prints a network-adjusted cold start
  (cold minus twice the provider's own command latency) as a sanity check, not as a ranking.
- **Hardware differs.** Azami ran nested inside an Azure VM (the GitHub runner, 4 vCPU), which taxes
  memory and disk benchmarks and VM exits. Hosted providers run on their production fleets.
- **Not a submission.** These are self-run results, not an aisandboxbench.com listing. Only the site's
  maintainers can publish a provider on the site.
- **Cost is not compared.** Azami is self-hosted; its $0 price entry only satisfies the harness.

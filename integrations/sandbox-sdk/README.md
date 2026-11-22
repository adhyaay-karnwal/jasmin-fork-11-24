# Jasmine on aisandboxbench's harness

[aisandboxbench.com](https://aisandboxbench.com) measures hosted sandbox providers with an open-source
harness, [opencoredev/sandbox-sdk](https://github.com/opencoredev/sandbox-sdk) (MIT). Jasmine is measured with
**that same harness**: no Jasmine-specific benchmark code is involved in timing.

- `jasmine/`: a sandbox-sdk provider adapter (a thin REST client for `jasmined`).
- `apply.py`: copies the adapter into a sandbox-sdk checkout and registers it with the bench. These are
  small edits anchored on existing code: credential policy, template key, native lookup, snapshot cleanup,
  and a $0 self-hosted price entry so the budget guard runs.
- `compare.py`: ranks Jasmine's results against the site's published `results.json`, using the same metric ids.
- `.github/workflows/sandbox-bench.yml`: builds Jasmine on a GitHub Actions KVM runner and serves it through
  a Cloudflare quick tunnel, so every call crosses the public internet. It then runs the harness with the
  flags from its own `bench/src/collection-plan.sh` (main, snapshot and burst suites; same-machine track,
  4 vCPU / 8 GB).

Reproduce: run the `sandbox-bench` workflow, download the `sandbox-bench-results` artifact, then:

```sh
curl -fsSL https://aisandboxbench.com/results.json -o published.json
python3 integrations/sandbox-sdk/compare.py published.json results/main/results.json results/snapshot/results.json results/burst/results.json
```

## Caveats (read before quoting numbers)

- **Client location differs.** The published numbers are timed from a server in Florida to each provider's
  region. Jasmine's are timed from the GitHub runner through a Cloudflare tunnel; the tunnel adds roughly
  25 ms per call, but that is not the same network path. `compare.py` prints a network-adjusted cold start
  (cold minus twice the provider's own command latency) as a sanity check, not as a ranking.
- **Hardware differs.** Jasmine ran nested inside an Azure VM (the GitHub runner, 4 vCPU), which taxes
  memory and disk benchmarks and VM exits. Hosted providers run on their production fleets.
- **Not a submission.** These are self-run results, not an aisandboxbench.com listing. Only the site's
  maintainers can publish a provider on the site.
- **Cost is not compared.** Jasmine is self-hosted; its $0 price entry only satisfies the harness.

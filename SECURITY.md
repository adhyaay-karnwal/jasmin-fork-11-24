# Security

Azami runs untrusted code. Escapes and isolation bugs are the most important bugs it can have.

## Reporting

Report privately through GitHub: **Security → Report a vulnerability** on this repository. Please don't open public
issues for security problems. We aim to acknowledge within 72 hours.

In scope: guest-to-host escapes; cross-sandbox access (disk, memory, network); bypassing the egress rules (cloud
metadata endpoint, host services, other sandboxes); reaching azamid's API from inside a sandbox; RNG or credential
leakage between sandboxes restored from one snapshot; authentication bypass on the API.

## Isolation model

- Each sandbox is a Firecracker microVM with its own guest kernel. Firecracker applies its seccomp filters by
  default. Running under Firecracker's `jailer` (chroot, cgroups, dropped privileges) is on the roadmap.
- Each sandbox has its own network namespace. Sandbox → host, sandbox → sandbox and sandbox → 169.254.0.0/16 are
  dropped by iptables.
- azamid listens on 127.0.0.1 by default. If you expose it, put it behind TLS and set `AZAMI_API_KEY`.

# Jasmine Cloud

How tryjasmine.dev's hosted sandboxes are run. Everything here is open source, like the engine.

```
SDKs / agents ──HTTPS──▶ gateway (api.tryjasmine.dev) ──private net──▶ jasmined hosts
                          keys · ownership · limits ·            Firecracker microVMs,
                          prepaid credit · metering              VMMs run unprivileged
                                │
                       Firestore (accounts, usage) · Stripe Checkout (top-ups)
```

- **`gateway/`** is the public API. It accepts the same API as `jasmined`, so the SDKs only need `JASMINE_URL=https://api.tryjasmine.dev`. It checks dashboard API keys, scopes every sandbox and snapshot to one account, enforces limits and timeouts, and meters usage per second against a prepaid balance. It keeps no sandbox state: owners and expiry live in daemon labels. Tests: `cd gateway && npm test`.
- **`deploy/host.sh`** sets up a sandbox host (any Linux machine with `/dev/kvm`).
- **`deploy/gateway.sh`** installs the gateway behind Caddy (automatic TLS).

## Billing model

Prepaid. Every account gets a one-time trial credit (`TRIAL_USD`, $2, no card). After that it buys credit through Stripe Checkout ($10 / $25 / $100). Usage comes off the balance. At $0, new sandboxes are refused and running ones are paused, never deleted. No customer can owe money, so the operator never fronts the cost of usage. Trial accounts get tighter limits until their first top-up (`trialLimits` in `gateway/src/config.mjs`).

Rates live in `gateway/src/config.mjs` and `site/src/app/pricing/parts.tsx`; change both together. Defaults: $0.0045 per vCPU-hour, $0.0015 per GiB-hour of memory, and $0.05 per GiB-month for paused sandboxes and snapshots.

## Going live, in order

1. **A sandbox host.** You need bare metal, or a VM with nested virtualization, where `ls /dev/kvm` works. Then run:
   ```sh
   sudo HOST_KEY=$(openssl rand -hex 32) GATEWAY_IP=<gateway ip> cloud/deploy/host.sh
   ```
   Keep `HOST_KEY`: the gateway needs it. A single machine can run both the host and the gateway (`LISTEN_IP=127.0.0.1`).
2. **Firebase service account.** Go to Firebase console → Project settings → Service accounts → Generate key. Deploy the rules and the `keys.hash` index from `site/firebase`:
   ```sh
   cd site/firebase && firebase deploy --only firestore
   ```
3. **Stripe.** You need the secret key, plus a webhook endpoint at `https://api.tryjasmine.dev/billing/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. You don't need products or prices: Checkout sessions are created with inline amounts.
4. **The gateway.** Point DNS for `api.tryjasmine.dev` at the gateway machine, then run:
   ```sh
   sudo DOMAIN=api.tryjasmine.dev HOSTS="h1=http://<host ip>:7171" HOST_KEY=<from step 1> \
        FIREBASE_SA=./sa.json STRIPE_SECRET_KEY=sk_live_… STRIPE_WEBHOOK_SECRET=whsec_… cloud/deploy/gateway.sh
   ```
5. **The site.** Build with `NEXT_PUBLIC_CLOUD_API=https://api.tryjasmine.dev`. The dashboard then shows the balance and top-up buttons instead of the early-access form.

Add hosts by running `host.sh` on each one and appending it to `JASMINE_HOSTS`. New sandboxes go to the host with the fewest running vCPUs.

## Keeping hosting costs at zero (or close)

- **Startup credits.** Google for Startups Cloud, AWS Activate and Microsoft for Startups all give credits. Google Cloud and Azure VMs support nested virtualization, which is what `/dev/kvm` needs. These programs, Stripe, and every cloud provider require an account holder who is 18 or older, so a parent or guardian has to own the accounts.
- **Start with one small machine** and let the first top-ups pay for the next. Since billing is prepaid, revenue arrives before the bill for the usage it covers.
- **Cheap dedicated servers** with KVM start around €30–35 a month. Check that the provider has patched recent nested-KVM CVEs if you use a nested VM rather than bare metal.

## Security notes

- Each VMM runs as its own unprivileged uid (`JASMINE_VM_UID_BASE`), never root. Sandboxes can't reach each other, the host, cloud metadata or port 25.
- Preview URLs are public by sandbox ID (64 random bits), as with other hosted sandboxes, and never wake a paused sandbox.
- Not done yet: a Firecracker jailer chroot per VM, and cgroup CPU/memory limits per VM.

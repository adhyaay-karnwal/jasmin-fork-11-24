# azami website

Next.js + Tailwind v4 + shadcn, with [gradients.sh](https://gradients.sh), [dithercn](https://dithercn.dev),
[asciicn](https://asciicn.dev) and [dither-kit](https://tripwire.sh/dither-kit) installed as source via the shadcn CLI.

```sh
pnpm install
pnpm dev
```

Every number on the page comes from a benchmark result file. None are hand-typed:

```sh
node scripts/sync-fairbench.mjs ../results/fairbench-<date>.json          # → src/data/fairbench.json
python3 ../integrations/sandbox-sdk/compare.py published.json main.json snapshot.json burst.json \
  --json src/data/aisandboxbench.json                                      # → src/data/aisandboxbench.json
```

While `fairbench.json` carries a `label`, the page shows it as a warning banner, so preliminary data can't ship
unnoticed.

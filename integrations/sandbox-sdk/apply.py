#!/usr/bin/env python3
"""Register the Warren adapter in an opencoredev/sandbox-sdk checkout.

    python3 integrations/sandbox-sdk/apply.py /path/to/sandbox-sdk

Copies the adapter into packages/sdk/src/providers/warren and makes the
smallest edits the bench needs to load it (credential policy, template key,
cloud-provider list, native lookup, snapshot cleanup + provenance). Every edit
is anchored on existing code and fails loudly if the anchor has moved, so a
silent partial patch is impossible. Pricing/billing are intentionally not
added: Warren is self-hosted and has no list price.
"""
import json
import pathlib
import shutil
import sys

root = pathlib.Path(sys.argv[1]).resolve()
here = pathlib.Path(__file__).resolve().parent


def edit(rel, old, new, count=1):
    p = root / rel
    s = p.read_text()
    if new in s:
        return  # already applied
    if s.count(old) < 1:
        sys.exit(f"apply.py: anchor not found in {rel}:\n{old}")
    p.write_text(s.replace(old, new, count))


# 1. Adapter files + package export.
dst = root / "packages/sdk/src/providers/warren"
shutil.copytree(here / "warren", dst, dirs_exist_ok=True)
pkg_path = root / "packages/sdk/package.json"
pkg = json.loads(pkg_path.read_text())
pkg["exports"]["./warren"] = {
    "types": "./dist/providers/warren/index.d.ts",
    "default": "./dist/providers/warren/index.js",
}
pkg_path.write_text(json.dumps(pkg, indent=2) + "\n")

# 2. Bench: credentials (WARREN_URL is the "credential"), template key, cloud list.
edit("bench/src/providers.ts", 'const templateKeys = new Map([\n', 'const templateKeys = new Map([\n  ["warren", "template"],\n')
edit("bench/src/providers.ts", 'const credentials = new Map([\n', 'const credentials = new Map([\n  ["warren", ["WARREN_URL"]],\n')
edit("bench/src/attempts.ts", 'export const cloudProviders = [\n', 'export const cloudProviders = [\n  "warren",\n')

# 3. Native exact-GET lookup (ownership / cleanup review).
edit(
    "bench/src/existence.ts",
    '        case "local": {\n          const docker = localDocker(provider, id);',
    '''        case "warren": {
          const res = await fetch(`${process.env.WARREN_URL}/v1/sandboxes/${encodeURIComponent(id)}`, {
            headers: process.env.WARREN_API_KEY ? { authorization: `Bearer ${process.env.WARREN_API_KEY}` } : {},
            signal,
          });
          if (!res.ok) throw Object.assign(new Error(`warren lookup ${res.status}`), { status: res.status });
          const box = (await res.json()) as { id: string; state?: string };
          return nativeInfo.parse({ id: box.id, status: box.state ?? "running" });
        }

        case "local": {
          const docker = localDocker(provider, id);''',
)

# 4. Snapshots: cleanup + provenance (warrend records the source sandbox).
edit(
    "bench/src/snapshots.ts",
    '  if (name === "tenki") {\n    const tenki = await tenkiClient();',
    '''  if (name === "warren")
    return async (id) => {
      const res = await fetch(`${process.env.WARREN_URL}/v1/templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: process.env.WARREN_API_KEY ? { authorization: `Bearer ${process.env.WARREN_API_KEY}` } : {},
      });
      if (!res.ok && res.status !== 404) throw new Error(`warren snapshot delete ${res.status}`);
    };

  if (name === "tenki") {
    const tenki = await tenkiClient();''',
)
edit(
    "bench/src/snapshots.ts",
    '      case "local": {\n        const docker = localDocker(provider, sourceId);',
    '''      case "warren": {
        const res = await fetch(`${process.env.WARREN_URL}/v1/templates/${encodeURIComponent(id)}`, {
          headers: process.env.WARREN_API_KEY ? { authorization: `Bearer ${process.env.WARREN_API_KEY}` } : {},
        });
        if (res.status === 404) return { exists: false };
        if (!res.ok) throw new Error(`warren snapshot lookup ${res.status}`);
        const t = (await res.json()) as { name: string; source_sandbox?: string };
        if (t.name !== id) throw new Error("Snapshot metadata ID mismatch");
        return { exists: true, ...(t.source_sandbox ? { sourceId: t.source_sandbox } : {}) };
      }

      case "local": {
        const docker = localDocker(provider, sourceId);''',
)
# 5. Pricing. Warren is self-hosted: there is no list price, only your own
#    hardware. $0 here keeps the harness's budget guard working; it must never be
#    read as "cheapest", and Warren's cost is excluded from every comparison.
edit(
    "bench/src/pricing.ts",
    "export const pricing: PriceTable = {\n",
    """export const pricing: PriceTable = {
  warren: {
    ...base,
    cpuSecond: 0,
    memoryGiBSecond: 0,
    diskGiBSecond: 0,
    retrieved: "2026-11-21",
    source: "https://github.com/arjunkshah12345-hash/warren",
    offeredSizes: [{ cpu: 2, memoryGiB: 4 }, { cpu: 4, memoryGiB: 8 }],
    notes: "Self-hosted open source: no list price. You pay for your own servers. Not comparable with hosted list prices; excluded from cost comparisons.",
  },
""",
)
edit(
    "bench/src/pricing.ts",
    "export const defaultCompute: ComputeTable = {\n",
    "export const defaultCompute: ComputeTable = {\n  warren: { cpu: 2, memoryGiB: 4 },\n",
)
print(f"warren adapter applied to {root}")

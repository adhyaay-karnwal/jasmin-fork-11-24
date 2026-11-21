import { createWarrenProvider, type WarrenOptions, type WarrenProvider } from "./provider.js";

export type { WarrenCapability, WarrenNative, WarrenOptions, WarrenProvider } from "./provider.js";

/** Warren (open-source Firecracker sandboxes) through warrend's REST API. */
export function warren(options: WarrenOptions = {}): WarrenProvider {
  return createWarrenProvider(options);
}

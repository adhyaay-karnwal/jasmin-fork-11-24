import { createAzamiProvider, type AzamiOptions, type AzamiProvider } from "./provider.js";

export type { AzamiCapability, AzamiNative, AzamiOptions, AzamiProvider } from "./provider.js";

/** Azami (open-source Firecracker sandboxes) through azamid's REST API. */
export function azami(options: AzamiOptions = {}): AzamiProvider {
  return createAzamiProvider(options);
}

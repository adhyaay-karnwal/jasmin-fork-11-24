import { createJasmineProvider, type JasmineOptions, type JasmineProvider } from "./provider.js";

export type { JasmineCapability, JasmineNative, JasmineOptions, JasmineProvider } from "./provider.js";

/** Jasmine (open-source Firecracker sandboxes) through jasmined's REST API. */
export function jasmine(options: JasmineOptions = {}): JasmineProvider {
  return createJasmineProvider(options);
}

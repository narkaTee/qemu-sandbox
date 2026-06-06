import type { ProviderName } from "../project-config.ts";
import { gondolinProvider } from "./gondolin/index.ts";
import { qemuProvider } from "./qemu/index.ts";
import type { SandboxProvider } from "./types.ts";

const providers: Record<ProviderName, SandboxProvider> = {
  qemu: qemuProvider,
  gondolin: gondolinProvider,
};

export function resolveProvider(name: ProviderName): SandboxProvider {
  return providers[name];
}

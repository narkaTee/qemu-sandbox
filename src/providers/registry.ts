import type { ProviderName } from "../project-config.ts";
import type { SandboxProvider } from "./types.ts";
import { qemuProvider } from "./qemu/index.ts";
import { gondolinProvider } from "./gondolin/index.ts";

const providers: Record<ProviderName, SandboxProvider> = {
  qemu: qemuProvider,
  gondolin: gondolinProvider,
};

export function resolveProvider(name: ProviderName): SandboxProvider {
  return providers[name];
}

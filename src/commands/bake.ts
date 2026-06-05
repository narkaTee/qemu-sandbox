import { loadProjectConfig } from "../project-config.ts";
import { resolveProvider } from "../providers/registry.ts";

export async function bake(): Promise<void> {
  const config = await loadProjectConfig();
  const provider = resolveProvider(config.settings.provider);
  if (!provider.bake) {
    throw new Error(`Provider does not support bake: ${provider.name}`);
  }
  await provider.bake(config);
  console.log(`Prepared provider: ${provider.name}`);
}

import { resolveImage } from "./images/registry.ts";
import type { ProjectConfig } from "./project-config.ts";
import type { ImageResult } from "./images/provider.ts";

export async function ensureBakedImage(
  config: ProjectConfig,
): Promise<ImageResult> {
  const provider = resolveImage(config.settings.image);
  return provider.bake(config);
}

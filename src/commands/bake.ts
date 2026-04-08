import { loadProjectConfig } from "../project-config.ts";
import { ensureBakedImage } from "../bake.ts";

export async function bake(): Promise<void> {
  const config = await loadProjectConfig();
  const image = await ensureBakedImage(config);
  console.log(`Baked image: ${image.diskImage}`);
}

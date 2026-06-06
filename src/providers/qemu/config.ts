import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists } from "../../project-config.ts";
import type { ProjectConfig } from "../../project-config.ts";

export async function loadCustomCloudInit(config: ProjectConfig): Promise<string | null> {
  const path = join(config.localConfigDir, "cloud-init.yaml");
  return (await fileExists(path)) ? readFile(path, "utf-8") : null;
}

export function customNixosModulePath(config: ProjectConfig): string {
  return join(config.localConfigDir, "nixos.nix");
}

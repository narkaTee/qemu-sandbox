import type { ProjectConfig } from "../project-config.ts";

export interface ImageResult {
  diskImage: string;
  useFwCfg: boolean;
}

export interface ImageProvider {
  name: string;
  ensureBaseImage(): Promise<string>;
  bake(config: ProjectConfig): Promise<ImageResult>;
}

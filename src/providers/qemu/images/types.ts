import type { ProjectConfig } from "../../../project-config.ts";

export interface QemuImageResult {
  diskImage: string;
  useFwCfg: boolean;
}

export interface QemuImage {
  name: string;
  bake(config: ProjectConfig): Promise<QemuImageResult>;
}

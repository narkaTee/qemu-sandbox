import type { ProjectConfig, ProviderName } from "../project-config.ts";

export interface StartedSandbox {
  pid: number;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshIdentityFile?: string;
}

export interface SandboxProvider {
  name: ProviderName;
  start(config: ProjectConfig, name: string, stateDir: string): Promise<StartedSandbox>;
  bake?(config: ProjectConfig): Promise<void>;
}

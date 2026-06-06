import { RealFSProvider, ReadonlyProvider, VM, type VirtualProvider } from "@earendil-works/gondolin";
import { join } from "node:path";
import type { MountEntry, ProjectConfig } from "../../project-config.ts";
import { MappedOwnerProvider } from "./mapped-owner-provider.ts";
import { ensureGondolinImage } from "./assets.ts";

type GondolinProvider = VirtualProvider;

function mountProvider(mount: MountEntry): GondolinProvider {
  const provider = new MappedOwnerProvider(new RealFSProvider(mount.host), 1000, 1000);
  return mount.readonly ? new ReadonlyProvider(provider) : provider;
}

export function createGondolinMounts(mounts: MountEntry[]): Record<string, GondolinProvider> {
  const result: Record<string, GondolinProvider> = {};
  for (const mount of mounts) {
    result[mount.guest] = mountProvider(mount);
  }
  return result;
}

export async function createGondolinVm(name: string, config: ProjectConfig, stateDir?: string): Promise<VM> {
  const imagePath = await ensureGondolinImage(config);
  const socketBase = stateDir ? join(stateDir, "sock") : undefined;
  return VM.create({
    sandbox: {
      imagePath,
      ...(socketBase
        ? {
            virtioSocketPath: `${socketBase}-ctl.sock`,
            virtioFsSocketPath: `${socketBase}-fs.sock`,
            virtioSshSocketPath: `${socketBase}-ssh.sock`,
            virtioIngressSocketPath: `${socketBase}-ing.sock`,
            netSocketPath: `${socketBase}-net.sock`,
          }
        : {}),
    },
    rootfs: { mode: "cow" },
    memory: `${config.settings.memory ?? 4096}M`,
    cpus: config.settings.cpus ?? 4,
    sessionLabel: name,
    vfs: {
      mounts: createGondolinMounts(config.mounts),
    },
  });
}

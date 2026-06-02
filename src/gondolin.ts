import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { arch, homedir } from "node:os";
import { join } from "node:path";
import {
  buildAssets,
  RealFSProvider,
  ReadonlyProvider,
  VM,
  type BuildConfig,
  type VirtualProvider,
} from "@earendil-works/gondolin";
import { MappedOwnerProvider } from "./gondolin-provider.ts";
import type { MountEntry, ProjectConfig } from "./project-config.ts";

const OCI_IMAGE = "ghcr.io/narkatee/sandbox-container:latest";
const IMAGE_DIR = join(
  homedir(),
  ".cache",
  "qemu-sandbox",
  "images",
  "gondolin-oci",
);

export function gondolinArch(): "x86_64" | "aarch64" {
  const a = arch();
  if (a === "x64") return "x86_64";
  if (a === "arm64") return "aarch64";
  throw new Error(`Unsupported architecture: ${a}`);
}

export function gondolinBuildConfig(): BuildConfig {
  return {
    arch: gondolinArch(),
    distro: "alpine",
    oci: {
      image: OCI_IMAGE,
      pullPolicy: "if-not-present",
    },
    runtimeDefaults: {
      rootfsMode: "cow",
    },
  };
}

export function gondolinImageHash(
  config: BuildConfig = gondolinBuildConfig(),
): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(config));
  return h.digest("hex").slice(0, 16);
}

export async function ensureGondolinImage(): Promise<string> {
  const config = gondolinBuildConfig();
  const outputDir = join(IMAGE_DIR, `assets-${gondolinImageHash(config)}`);
  try {
    await readFile(join(outputDir, "manifest.json"));
    return outputDir;
  } catch {}

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "build-config.json"),
    JSON.stringify(config, null, 2),
  );
  console.log(`Building Gondolin OCI image from ${OCI_IMAGE}...`);
  await buildAssets(config, {
    outputDir,
    verbose: true,
    workDir: join(outputDir, ".work"),
  });
  return outputDir;
}

type GondolinProvider = VirtualProvider;

function mountProvider(mount: MountEntry): GondolinProvider {
  const provider = new MappedOwnerProvider(
    new RealFSProvider(mount.host),
    1000,
    1000,
  );
  return mount.readonly ? new ReadonlyProvider(provider) : provider;
}

export function createGondolinMounts(
  mounts: MountEntry[],
): Record<string, GondolinProvider> {
  const result: Record<string, GondolinProvider> = {};
  for (const mount of mounts) {
    result[mount.guest] = mountProvider(mount);
  }
  return result;
}

export async function createGondolinVm(
  name: string,
  config: ProjectConfig,
  stateDir?: string,
): Promise<VM> {
  const imagePath = await ensureGondolinImage();
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

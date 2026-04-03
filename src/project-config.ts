import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "yaml";

const CONFIG_DIR = ".qemu-sandbox";

export interface MountEntry {
  host: string;
  guest: string;
  readonly: boolean;
}

export interface SandboxSettings {
  image: string | null;
  memory: number | null;
  cpus: number | null;
}

export interface ProjectConfig {
  projectRoot: string;
  settings: SandboxSettings;
  customCloudInit: string | null;
  mounts: MountEntry[];
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

function parseMounts(raw: unknown): MountEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.host === "string" &&
        typeof e.guest === "string",
    )
    .map((e) => ({
      host: e.host as string,
      guest: e.guest as string,
      readonly: e.readonly === true,
    }));
}

function parseSettings(raw: unknown): SandboxSettings {
  const defaults: SandboxSettings = { image: null, memory: null, cpus: null };
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    image: typeof obj.image === "string" ? obj.image : null,
    memory: typeof obj.memory === "number" ? obj.memory : null,
    cpus: typeof obj.cpus === "number" ? obj.cpus : null,
  };
}

export function resolveMounts(
  mounts: MountEntry[],
  projectRoot: string,
): MountEntry[] {
  return mounts.map((m) => ({
    ...m,
    host: resolve(projectRoot, m.host),
  }));
}

export async function loadProjectConfig(
  projectRoot: string = process.cwd(),
): Promise<ProjectConfig> {
  const configDir = join(projectRoot, CONFIG_DIR);
  const sandboxPath = join(configDir, "sandbox.yaml");
  const cloudInitPath = join(configDir, "cloud-init.yaml");
  const mountsPath = join(configDir, "mounts.yaml");

  const settings = (await fileExists(sandboxPath))
    ? parseSettings(parse(await readFile(sandboxPath, "utf-8")))
    : { image: null, memory: null, cpus: null };

  const customCloudInit = (await fileExists(cloudInitPath))
    ? await readFile(cloudInitPath, "utf-8")
    : null;

  let mounts: MountEntry[] = [];
  if (await fileExists(mountsPath)) {
    mounts = resolveMounts(
      parseMounts(parse(await readFile(mountsPath, "utf-8"))),
      projectRoot,
    );
  }

  return { projectRoot, settings, customCloudInit, mounts };
}

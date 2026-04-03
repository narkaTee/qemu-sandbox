import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";

const LOCAL_CONFIG_DIR = ".qemu-sandbox";
const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "qemu-sandbox");

export interface MountEntry {
  host: string;
  guest: string;
  readonly: boolean;
}

export interface SandboxSettings {
  image: string | null;
  memory: number | null;
  cpus: number | null;
  "mount-workspace": boolean;
  "mount-agent-configs": string[];
}

export interface ProjectConfig {
  projectRoot: string;
  settings: SandboxSettings;
  customCloudInit: string | null;
  mounts: MountEntry[];
}

export async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

export function deriveGuestPath(host: string): string {
  if (host.startsWith("~/") || host === "~") {
    return "/home/dev" + host.slice(1);
  }
  throw new Error(
    `Mount '${host}' is a relative path and requires an explicit 'guest' field`,
  );
}

export function parseMounts(raw: unknown): MountEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.host === "string",
    )
    .map((e) => {
      const host = e.host as string;
      const guest = typeof e.guest === "string" ? e.guest : deriveGuestPath(host);
      return {
        host,
        guest,
        readonly: e.readonly === true,
      };
    });
}

const DEFAULT_SETTINGS: SandboxSettings = {
  image: null,
  memory: null,
  cpus: null,
  "mount-workspace": false,
  "mount-agent-configs": [],
};

export function parseSettings(raw: unknown): SandboxSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const obj = raw as Record<string, unknown>;
  return {
    image: typeof obj.image === "string" ? obj.image : null,
    memory: typeof obj.memory === "number" ? obj.memory : null,
    cpus: typeof obj.cpus === "number" ? obj.cpus : null,
    "mount-workspace": obj["mount-workspace"] === true,
    "mount-agent-configs": Array.isArray(obj["mount-agent-configs"])
      ? obj["mount-agent-configs"].filter((v): v is string => typeof v === "string")
      : [],
  };
}

export function mergeSettings(
  global: SandboxSettings,
  local: SandboxSettings,
): SandboxSettings {
  return {
    image: local.image ?? global.image,
    memory: local.memory ?? global.memory,
    cpus: local.cpus ?? global.cpus,
    "mount-workspace": local["mount-workspace"] || global["mount-workspace"],
    "mount-agent-configs": local["mount-agent-configs"].length > 0
      ? local["mount-agent-configs"]
      : global["mount-agent-configs"],
  };
}

export function resolveMounts(
  mounts: MountEntry[],
  projectRoot: string,
): MountEntry[] {
  return mounts.map((m) => ({
    ...m,
    host: m.host.startsWith("~")
      ? resolve(homedir(), m.host.slice(2))
      : resolve(projectRoot, m.host),
  }));
}

async function loadYaml(path: string): Promise<unknown> {
  if (!(await fileExists(path))) return null;
  return parse(await readFile(path, "utf-8"));
}

export async function loadProjectConfig(
  projectRoot: string = process.cwd(),
): Promise<ProjectConfig> {
  const localDir = join(projectRoot, LOCAL_CONFIG_DIR);

  const globalSettings = parseSettings(
    await loadYaml(join(GLOBAL_CONFIG_DIR, "sandbox.yaml")),
  );
  const localSettings = parseSettings(
    await loadYaml(join(localDir, "sandbox.yaml")),
  );
  const settings = mergeSettings(globalSettings, localSettings);

  const customCloudInit = (await fileExists(join(localDir, "cloud-init.yaml")))
    ? await readFile(join(localDir, "cloud-init.yaml"), "utf-8")
    : null;

  const mountsRaw = await loadYaml(join(localDir, "mounts.yaml"));
  const mounts = resolveMounts(parseMounts(mountsRaw), projectRoot);

  return { projectRoot, settings, customCloudInit, mounts };
}

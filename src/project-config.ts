import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import { resolveAgentConfigs } from "./agent-mounts.ts";
import type { FileCopy } from "./agent-mounts.ts";

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
  copies: FileCopy[];
}

export async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

export function validateGuestPath(path: string): void {
  if (path.length === 0) {
    throw new Error("Guest path cannot be empty");
  }
  if (path.includes("\0")) {
    throw new Error("Guest path cannot contain null bytes");
  }
  if (/[\x01-\x1F\x7F]/.test(path)) {
    throw new Error("Guest path cannot contain control characters");
  }
  if (!path.startsWith("/")) {
    throw new Error(`Guest path must be absolute: ${path}`);
  }
  if (path.split("/").includes("..")) {
    throw new Error(`Guest path cannot contain '..' segments: ${path}`);
  }
}

export function validateHostPath(path: string): void {
  if (path.length === 0) {
    throw new Error("Host path cannot be empty");
  }
  if (path.includes("\0")) {
    throw new Error("Host path cannot contain null bytes");
  }
  if (/[\x01-\x1F\x7F]/.test(path)) {
    throw new Error("Host path cannot contain control characters");
  }
  if (path.startsWith("~") && path !== "~" && !path.startsWith("~/")) {
    throw new Error(`Host path has unsupported tilde form: ${path}`);
  }
}

export function deriveGuestPath(host: string): string {
  validateHostPath(host);
  if (host.startsWith("~/") || host === "~") {
    const path = "/home/dev" + host.slice(1);
    validateGuestPath(path);
    return path;
  }
  throw new Error(
    `Mount '${host}' is a relative path and requires an explicit 'guest' field`,
  );
}

export function parseMounts(raw: unknown): MountEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === "object" && typeof e.host === "string")
    .map((e) => {
      const host = e.host as string;
      validateHostPath(host);
      const guest =
        typeof e.guest === "string" ? e.guest : deriveGuestPath(host);
      validateGuestPath(guest);
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
      ? obj["mount-agent-configs"].filter(
          (v): v is string => typeof v === "string",
        )
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
    "mount-agent-configs":
      local["mount-agent-configs"].length > 0
        ? local["mount-agent-configs"]
        : global["mount-agent-configs"],
  };
}

export function resolveHostPath(path: string, projectRoot: string): string {
  validateHostPath(path);
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(projectRoot, path);
}

export function resolveMounts(
  mounts: MountEntry[],
  projectRoot: string,
): MountEntry[] {
  return mounts.map((m) => ({
    ...m,
    host: resolveHostPath(m.host, projectRoot),
  }));
}

async function validateMountHostsExist(mounts: MountEntry[]): Promise<void> {
  for (const mount of mounts) {
    const s = await stat(mount.host).catch(() => null);
    if (!s) {
      throw new Error(`Host mount path does not exist: ${mount.host}`);
    }
    if (!s.isDirectory()) {
      throw new Error(`Host mount path must be a directory: ${mount.host}`);
    }
  }
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

  if (settings["mount-workspace"]) {
    mounts.unshift({
      host: projectRoot,
      guest: "/home/dev/workspace",
      readonly: false,
    });
  }

  let copies: FileCopy[] = [];
  if (settings["mount-agent-configs"].length > 0) {
    const agent = await resolveAgentConfigs(settings["mount-agent-configs"]);
    mounts.push(...agent.mounts);
    copies = agent.copies;
  }

  await validateMountHostsExist(mounts);

  return { projectRoot, settings, customCloudInit, mounts, copies };
}

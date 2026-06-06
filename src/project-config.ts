import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import type { FileCopy } from "./agent-mounts.ts";
import { resolveAgentConfigs } from "./agent-mounts.ts";

const LOCAL_CONFIG_DIR = ".qemu-sandbox";
const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "qemu-sandbox");
const DEFAULT_GONDOLIN_OCI = "ghcr.io/narkatee/sandbox-container:latest";

export interface MountEntry {
  host: string;
  guest: string;
  readonly: boolean;
}

export type ProviderName = "qemu" | "gondolin";
export type QemuImageName = "debian-13" | "nixos";

export interface QemuSettings {
  image: QemuImageName;
}

export interface GondolinSettings {
  oci: string;
  "oci-build"?: string;
}

export interface SandboxSettings {
  provider: ProviderName;
  memory: number | null;
  cpus: number | null;
  "mount-workspace": boolean;
  "mount-agent-configs": string[];
  qemu: QemuSettings;
  gondolin: GondolinSettings;
}

interface ParsedSandboxSettings {
  provider?: ProviderName;
  memory?: number;
  cpus?: number;
  "mount-workspace"?: boolean;
  "mount-agent-configs"?: string[];
  qemu?: Partial<QemuSettings>;
  gondolin?: Partial<GondolinSettings>;
}

export interface ProjectConfig {
  projectRoot: string;
  localConfigDir: string;
  settings: SandboxSettings;
  mounts: MountEntry[];
  copies: FileCopy[];
}

export async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false
  );
}

export function validateGuestPath(path: string): void {
  if (path.length === 0) {
    throw new Error("Guest path cannot be empty");
  }
  if (path.includes("\0")) {
    throw new Error("Guest path cannot contain null bytes");
  }
  if (/\p{Cc}/u.test(path)) {
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
  if (/\p{Cc}/u.test(path)) {
    throw new Error("Host path cannot contain control characters");
  }
  if (path.startsWith("~") && path !== "~" && !path.startsWith("~/")) {
    throw new Error(`Host path has unsupported tilde form: ${path}`);
  }
}

export function deriveGuestPath(host: string): string {
  validateHostPath(host);
  if (host.startsWith("~/") || host === "~") {
    const path = `/home/dev${host.slice(1)}`;
    validateGuestPath(path);
    return path;
  }
  throw new Error(`Mount '${host}' is a relative path and requires an explicit 'guest' field`);
}

export function parseMounts(raw: unknown): MountEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === "object" && typeof e.host === "string")
    .map((e) => {
      const host = e.host as string;
      validateHostPath(host);
      const guest = typeof e.guest === "string" ? e.guest : deriveGuestPath(host);
      validateGuestPath(guest);
      return {
        host,
        guest,
        readonly: e.readonly === true,
      };
    });
}

const DEFAULT_SETTINGS: SandboxSettings = {
  provider: "qemu",
  memory: null,
  cpus: null,
  "mount-workspace": false,
  "mount-agent-configs": [],
  qemu: {
    image: "debian-13",
  },
  gondolin: {
    oci: DEFAULT_GONDOLIN_OCI,
  },
};

function parseProvider(value: unknown): ProviderName | undefined {
  if (value === "qemu" || value === "gondolin") return value;
  return undefined;
}

function parseQemuImage(value: unknown): QemuImageName | undefined {
  if (value === "debian-13" || value === "nixos") return value;
  return undefined;
}

function validateKnownSettings(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const obj = raw as Record<string, unknown>;
  const qemu = obj.qemu && typeof obj.qemu === "object" ? (obj.qemu as Record<string, unknown>) : null;

  if (qemu && "image" in qemu && parseQemuImage(qemu.image) === undefined) {
    throw new Error(`Unknown QEMU image: ${String(qemu.image)} (available: debian-13, nixos)`);
  }
}

function parseOptionalSettings(raw: unknown): ParsedSandboxSettings {
  validateKnownSettings(raw);
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const qemu = obj.qemu && typeof obj.qemu === "object" ? (obj.qemu as Record<string, unknown>) : null;
  const gondolin = obj.gondolin && typeof obj.gondolin === "object" ? (obj.gondolin as Record<string, unknown>) : null;

  return {
    ...(parseProvider(obj.provider) ? { provider: parseProvider(obj.provider) } : {}),
    ...(typeof obj.memory === "number" ? { memory: obj.memory } : {}),
    ...(typeof obj.cpus === "number" ? { cpus: obj.cpus } : {}),
    ...(typeof obj["mount-workspace"] === "boolean" ? { "mount-workspace": obj["mount-workspace"] } : {}),
    ...(Array.isArray(obj["mount-agent-configs"])
      ? {
          "mount-agent-configs": obj["mount-agent-configs"].filter((v): v is string => typeof v === "string"),
        }
      : {}),
    ...(qemu && parseQemuImage(qemu.image) ? { qemu: { image: parseQemuImage(qemu.image) } } : {}),
    ...(gondolin
      ? {
          gondolin: {
            ...(typeof gondolin.oci === "string" ? { oci: gondolin.oci } : {}),
            ...(typeof gondolin["oci-build"] === "string" ? { "oci-build": gondolin["oci-build"] } : {}),
          },
        }
      : {}),
  };
}

function applySettingsDefaults(settings: ParsedSandboxSettings): SandboxSettings {
  validateGondolinSettings(settings);
  return {
    provider: settings.provider ?? DEFAULT_SETTINGS.provider,
    memory: settings.memory ?? DEFAULT_SETTINGS.memory,
    cpus: settings.cpus ?? DEFAULT_SETTINGS.cpus,
    "mount-workspace": settings["mount-workspace"] ?? DEFAULT_SETTINGS["mount-workspace"],
    "mount-agent-configs": settings["mount-agent-configs"] ?? DEFAULT_SETTINGS["mount-agent-configs"],
    qemu: {
      image: settings.qemu?.image ?? DEFAULT_SETTINGS.qemu.image,
    },
    gondolin: {
      oci: settings.gondolin?.oci ?? DEFAULT_SETTINGS.gondolin.oci,
      "oci-build": settings.gondolin?.["oci-build"],
    },
  };
}

function validateGondolinSettings(settings: ParsedSandboxSettings): void {
  if (settings.gondolin?.oci !== undefined && settings.gondolin?.["oci-build"] !== undefined) {
    throw new Error("gondolin.oci and gondolin.oci-build are mutually exclusive");
  }
}

export function parseSettings(raw: unknown): SandboxSettings {
  return applySettingsDefaults(parseOptionalSettings(raw));
}

export function mergeSettings(global: unknown, local: unknown): SandboxSettings {
  const globalSettings = parseOptionalSettings(global);
  const localSettings = parseOptionalSettings(local);
  const gondolin = {
    ...globalSettings.gondolin,
    ...localSettings.gondolin,
  };
  if (localSettings.gondolin?.oci !== undefined) delete gondolin["oci-build"];
  if (localSettings.gondolin?.["oci-build"] !== undefined) delete gondolin.oci;

  return applySettingsDefaults({
    ...globalSettings,
    ...localSettings,
    qemu: {
      ...globalSettings.qemu,
      ...localSettings.qemu,
    },
    gondolin,
  });
}

export function resolveHostPath(path: string, projectRoot: string): string {
  validateHostPath(path);
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(projectRoot, path);
}

export function resolveMounts(mounts: MountEntry[], projectRoot: string): MountEntry[] {
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

export async function loadProjectConfig(projectRoot: string = process.cwd()): Promise<ProjectConfig> {
  const localConfigDir = join(projectRoot, LOCAL_CONFIG_DIR);

  const globalRaw = await loadYaml(join(GLOBAL_CONFIG_DIR, "sandbox.yaml"));
  const localRaw = await loadYaml(join(localConfigDir, "sandbox.yaml"));
  const settings = mergeSettings(globalRaw, localRaw);

  const mountsRaw = await loadYaml(join(localConfigDir, "mounts.yaml"));
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

  return { projectRoot, localConfigDir, settings, mounts, copies };
}

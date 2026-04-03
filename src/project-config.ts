import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

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

function parseMountsYaml(text: string): MountEntry[] {
  const entries: MountEntry[] = [];
  let current: Partial<MountEntry> | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("- ")) {
      if (current?.host && current?.guest) {
        entries.push({
          host: current.host,
          guest: current.guest,
          readonly: current.readonly ?? false,
        });
      }
      current = {};
      const inline = line.slice(2).trim();
      if (inline) parseField(current, inline);
      continue;
    }

    if (current) parseField(current, line);
  }

  if (current?.host && current?.guest) {
    entries.push({
      host: current.host,
      guest: current.guest,
      readonly: current.readonly ?? false,
    });
  }

  return entries;
}

function parseField(entry: Partial<MountEntry>, line: string): void {
  const match = line.match(/^(\w+):\s*(.+)$/);
  if (!match) return;
  const [, key, value] = match;
  if (key === "host") entry.host = value.trim();
  else if (key === "guest") entry.guest = value.trim();
  else if (key === "readonly") entry.readonly = value.trim() === "true";
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

function parseSandboxYaml(text: string): SandboxSettings {
  const settings: SandboxSettings = { image: null, memory: null, cpus: null };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "image") settings.image = value.trim();
    else if (key === "memory") settings.memory = parseInt(value.trim(), 10);
    else if (key === "cpus") settings.cpus = parseInt(value.trim(), 10);
  }
  return settings;
}

export async function loadProjectConfig(
  projectRoot: string = process.cwd(),
): Promise<ProjectConfig> {
  const configDir = join(projectRoot, CONFIG_DIR);
  const sandboxPath = join(configDir, "sandbox.yaml");
  const cloudInitPath = join(configDir, "cloud-init.yaml");
  const mountsPath = join(configDir, "mounts.yaml");

  const settings = (await fileExists(sandboxPath))
    ? parseSandboxYaml(await readFile(sandboxPath, "utf-8"))
    : { image: null, memory: null, cpus: null };

  const customCloudInit = (await fileExists(cloudInitPath))
    ? await readFile(cloudInitPath, "utf-8")
    : null;

  let mounts: MountEntry[] = [];
  if (await fileExists(mountsPath)) {
    const raw = await readFile(mountsPath, "utf-8");
    mounts = resolveMounts(parseMountsYaml(raw), projectRoot);
  }

  return { projectRoot, settings, customCloudInit, mounts };
}

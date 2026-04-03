import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:os";
import { stringify, parse } from "yaml";
import { exec } from "./exec.ts";
import type { MountEntry } from "./project-config.ts";

export interface CloudInitConfig {
  hostname: string;
  sshAuthorizedKeys?: string[];
  customCloudInit?: string | null;
  mounts?: MountEntry[];
}

function buildUserData(config: CloudInitConfig): Record<string, unknown> {
  const doc: Record<string, unknown> = {};

  if (config.hostname) {
    doc.hostname = config.hostname;
  }

  const user: Record<string, unknown> = {
    name: "dev",
    plain_text_passwd: "dev",
    shell: "/bin/bash",
    sudo: "ALL=(ALL) NOPASSWD:ALL",
    lock_passwd: false,
  };
  if (config.sshAuthorizedKeys?.length) {
    user.ssh_authorized_keys = config.sshAuthorizedKeys;
  }
  doc.users = [user];

  doc.ssh_pwauth = true;

  if (config.mounts?.length) {
    doc.mounts = config.mounts.map((m, i) => {
      const tag = `mount${i}`;
      const opts = `trans=virtio${m.readonly ? ",ro" : ""}`;
      return [tag, m.guest, "9p", opts, "0", "0"];
    });
  }

  if (config.customCloudInit) {
    const custom = parse(config.customCloudInit) as Record<string, unknown>;
    mergeCustomCloudInit(doc, custom);
  }

  return doc;
}

const PROTECTED_KEYS = new Set(["hostname"]);

function mergeCustomCloudInit(
  doc: Record<string, unknown>,
  custom: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(custom)) {
    if (PROTECTED_KEYS.has(key)) {
      console.warn(
        `cloud-init: ignoring protected key '${key}' from custom config`,
      );
      continue;
    }
    if (key === "users" && Array.isArray(value)) {
      doc.users = mergeUsers(doc.users as Record<string, unknown>[], value);
      continue;
    }
    if (key in doc && Array.isArray(doc[key]) && Array.isArray(value)) {
      doc[key] = [...(doc[key] as unknown[]), ...value];
    } else {
      doc[key] = value;
    }
  }
}

function mergeUsers(
  base: Record<string, unknown>[],
  custom: unknown[],
): Record<string, unknown>[] {
  const result = [...base];
  for (const entry of custom) {
    if (!entry || typeof entry !== "object" || !("name" in entry)) {
      result.push(entry as Record<string, unknown>);
      continue;
    }
    const name = (entry as Record<string, unknown>).name;
    if (name === "dev") {
      console.warn("cloud-init: ignoring custom 'dev' user definition");
      continue;
    }
    const existing = result.findIndex(
      (u) => u && typeof u === "object" && u.name === name,
    );
    if (existing >= 0) {
      result[existing] = entry as Record<string, unknown>;
    } else {
      result.push(entry as Record<string, unknown>);
    }
  }
  return result;
}

export function renderUserData(config: CloudInitConfig): string {
  return "#cloud-config\n" + stringify(buildUserData(config));
}

function renderMetaData(config: CloudInitConfig): string {
  return stringify({
    "instance-id": config.hostname,
    "local-hostname": config.hostname,
  });
}

export async function createSeedIso(
  outputPath: string,
  config: CloudInitConfig,
): Promise<void> {
  const seedDir = `${outputPath}.d`;
  await mkdir(seedDir, { recursive: true });

  await writeFile(join(seedDir, "user-data"), renderUserData(config));
  await writeFile(join(seedDir, "meta-data"), renderMetaData(config));

  if (platform() === "darwin") {
    await exec("hdiutil", [
      "makehybrid",
      "-o",
      outputPath,
      "-hfs",
      "-joliet",
      "-iso",
      "-default-volume-name",
      "cidata",
      seedDir,
    ]);
  } else {
    const tool = await findLinuxIsoTool();
    await exec(tool, [
      "-output",
      outputPath,
      "-volid",
      "cidata",
      "-joliet",
      "-rock",
      join(seedDir, "user-data"),
      join(seedDir, "meta-data"),
    ]);
  }
}

async function findLinuxIsoTool(): Promise<string> {
  for (const tool of ["genisoimage", "mkisofs", "xorriso"]) {
    try {
      await exec("which", [tool]);
      if (tool === "xorriso") return "xorrisofs";
      return tool;
    } catch {
      continue;
    }
  }
  throw new Error(
    "No ISO tool found. Install one of: genisoimage, mkisofs, xorriso",
  );
}

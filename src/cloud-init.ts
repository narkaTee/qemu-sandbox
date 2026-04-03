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
    for (const [key, value] of Object.entries(custom)) {
      if (key in doc && Array.isArray(doc[key]) && Array.isArray(value)) {
        doc[key] = [...(doc[key] as unknown[]), ...value];
      } else {
        doc[key] = value;
      }
    }
  }

  return doc;
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

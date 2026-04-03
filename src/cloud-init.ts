import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:os";
import { exec } from "./exec.ts";
import type { MountEntry } from "./project-config.ts";

export interface CloudInitConfig {
  hostname: string;
  sshAuthorizedKeys?: string[];
  customCloudInit?: string | null;
  mounts?: MountEntry[];
}

function yamlEscape(value: string): string {
  if (/[\n\r"'\\:#{}[\],&*?|>!%@`]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function renderUserData(config: CloudInitConfig): string {
  const lines = ["#cloud-config"];
  if (config.hostname) {
    lines.push(`hostname: ${yamlEscape(config.hostname)}`);
  }
  lines.push("users:");
  lines.push("  - name: dev");
  lines.push("    plain_text_passwd: dev");
  lines.push("    shell: /bin/bash");
  lines.push("    sudo: ALL=(ALL) NOPASSWD:ALL");
  lines.push("    lock_passwd: false");
  if (config.sshAuthorizedKeys?.length) {
    lines.push("    ssh_authorized_keys:");
    for (const key of config.sshAuthorizedKeys) {
      lines.push(`      - ${yamlEscape(key)}`);
    }
  }
  lines.push("ssh_pwauth: true");
  if (config.mounts?.length) {
    lines.push("bootcmd:");
    lines.push("  - modprobe 9pnet_virtio");
    for (const [i, m] of config.mounts.entries()) {
      lines.push(`  - mkdir -p ${m.guest}`);
    }
    lines.push("mounts:");
    for (const [i, m] of config.mounts.entries()) {
      const tag = `mount${i}`;
      const opts = `trans=virtio${m.readonly ? ",ro" : ""}`;
      lines.push(
        `  - [${yamlEscape(tag)}, ${yamlEscape(m.guest)}, "9p", ${yamlEscape(opts)}, "0", "0"]`,
      );
    }
  }
  if (config.customCloudInit) {
    const custom = config.customCloudInit.replace(/^#cloud-config\s*\n?/, "");
    lines.push(custom.trimEnd());
  }
  return lines.join("\n") + "\n";
}

function renderMetaData(config: CloudInitConfig): string {
  return `instance-id: ${config.hostname}\nlocal-hostname: ${config.hostname}\n`;
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

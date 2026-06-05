import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { join } from "node:path";
import { exec } from "../../exec.ts";
import type { MountEntry } from "../../project-config.ts";

export function qemuSystemBinary(): string {
  const a = arch();
  if (a === "x64") return "qemu-system-x86_64";
  if (a === "arm64") return "qemu-system-aarch64";
  throw new Error(`Unsupported architecture: ${a}`);
}

export async function detectAccel(): Promise<string> {
  const os = platform();
  if (os === "linux") {
    try {
      await access("/dev/kvm", constants.R_OK | constants.W_OK);
      return "kvm";
    } catch {
      return "tcg";
    }
  }
  if (os === "darwin") {
    return "hvf";
  }
  return "tcg";
}

export interface VmConfig {
  name: string;
  stateDir: string;
  baseImage: string;
  seedIso?: string;
  sshPort: number;
  memory?: number;
  cpus?: number;
  mounts?: MountEntry[];
  fwCfg?: Record<string, string>;
}

export async function createOverlay(
  baseImage: string,
  overlayPath: string,
  sizeGb: number = 20,
): Promise<void> {
  await exec("qemu-img", [
    "create",
    "-f",
    "qcow2",
    "-b",
    baseImage,
    "-F",
    "qcow2",
    overlayPath,
    `${sizeGb}G`,
  ]);
}

async function writeFwCfgFile(
  dir: string,
  name: string,
  content: string,
): Promise<string> {
  const path = join(dir, `fwcfg-${name}`);
  await writeFile(path, content);
  return path;
}

export async function launchVm(config: VmConfig): Promise<number> {
  await mkdir(config.stateDir, { recursive: true });

  const overlayPath = join(config.stateDir, "overlay.qcow2");
  const pidFile = join(config.stateDir, "vm.pid");

  await createOverlay(config.baseImage, overlayPath);

  const accel = await detectAccel();
  console.log(`Acceleration: ${accel}`);
  const memory = config.memory ?? 4096;
  const cpus = config.cpus ?? 4;

  const args = [
    "-accel",
    accel,
    "-cpu",
    accel === "tcg" ? "max" : "host",
    "-m",
    String(memory),
    "-smp",
    String(cpus),
    "-nographic",
    "-nodefaults",
    "-monitor",
    "none",
    "-serial",
    "none",
    "-drive",
    `file=${overlayPath},if=virtio,cache=writeback`,
    "-netdev",
    `user,id=net0,hostfwd=tcp::${config.sshPort}-:22`,
    "-device",
    "virtio-net,netdev=net0",
    "-object",
    "rng-random,id=rng0,filename=/dev/urandom",
    "-device",
    "virtio-rng,rng=rng0",
    "-pidfile",
    pidFile,
    "-daemonize",
  ];

  if (config.seedIso) {
    args.push(
      "-drive",
      `file=${config.seedIso},if=virtio,format=raw,media=cdrom`,
    );
  }

  if (config.fwCfg) {
    for (const [key, value] of Object.entries(config.fwCfg)) {
      const filePath = await writeFwCfgFile(config.stateDir, key, value);
      args.push("-fw_cfg", `name=opt/com.sandbox/${key},file=${filePath}`);
    }
  }

  if (config.mounts?.length) {
    for (const [i, m] of config.mounts.entries()) {
      const tag = `mount${i}`;
      const ro = m.readonly ? ",readonly=on" : "";
      args.push(
        "-virtfs",
        `local,path=${m.host},mount_tag=${tag},security_model=mapped-xattr${ro}`,
      );
    }
  }

  const qemu = spawn(qemuSystemBinary(), args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let stderr = "";
    qemu.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    qemu.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`QEMU failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const pid = parseInt((await readFile(pidFile, "utf-8")).trim(), 10);
        resolve(pid);
      } catch (err) {
        reject(new Error(`QEMU started but no PID file found: ${err}`));
      }
    });
    qemu.on("error", (err) => {
      reject(new Error(`Failed to spawn QEMU: ${err.message}`));
    });
  });
}

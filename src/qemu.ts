import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { join } from "node:path";
import { exec } from "./exec.ts";
import { SSH_OPTS } from "./ssh.ts";
import type { MountEntry } from "./project-config.ts";

export function qemuSystemBinary(): string {
  const a = arch();
  if (a === "x64") return "qemu-system-x86_64";
  if (a === "arm64") return "qemu-system-aarch64";
  throw new Error(`Unsupported architecture: ${a}`);
}

import { constants } from "node:fs";

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
  seedIso: string;
  sshPort: number;
  memory?: number;
  cpus?: number;
  mounts?: MountEntry[];
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

export async function launchVm(config: VmConfig): Promise<number> {
  await mkdir(config.stateDir, { recursive: true });

  const overlayPath = join(config.stateDir, "overlay.qcow2");
  const pidFile = join(config.stateDir, "qemu.pid");

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
    "-drive",
    `file=${config.seedIso},if=virtio,format=raw,media=cdrom`,
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
        await writeFile(
          join(config.stateDir, "ssh.port"),
          String(config.sshPort),
        );
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

export interface WaitForSshOptions {
  host: string;
  port: number;
  user?: string;
  identityFile?: string;
  timeoutSeconds?: number;
}

export function waitForSsh(opts: WaitForSshOptions): Promise<void> {
  const { host, port, user = "dev", identityFile, timeoutSeconds = 120 } = opts;
  const deadline = Date.now() + timeoutSeconds * 1000;

  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() > deadline) {
        reject(
          new Error(
            `SSH not reachable on ${host}:${port} within ${timeoutSeconds}s`,
          ),
        );
        return;
      }

      const sshArgs = [
        ...SSH_OPTS,
        "-o",
        "ConnectTimeout=2",
        "-o",
        "BatchMode=yes",
        ...(identityFile ? ["-i", identityFile] : []),
        "-p",
        String(port),
        `${user}@${host}`,
        "true",
      ];

      const child = spawn("ssh", sshArgs, { stdio: "ignore" });
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          setTimeout(attempt, 2000);
        }
      });
      child.on("error", () => {
        setTimeout(attempt, 2000);
      });
    }
    attempt();
  });
}

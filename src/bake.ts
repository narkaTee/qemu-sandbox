import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { resolveImage } from "./images/registry.ts";
import { createSeedIso } from "./cloud-init.ts";
import { launchVm, waitForSsh } from "./qemu.ts";
import { allocateSshPort } from "./ssh-port.ts";
import { exec } from "./exec.ts";
import { SSH_OPTS } from "./ssh.ts";
import type { ProjectConfig } from "./project-config.ts";

const BAKED_DIR = join(homedir(), ".cache", "qemu-sandbox", "images", "baked");

export function bakeHash(
  baseImage: string,
  customCloudInit: string | null,
): string {
  const h = createHash("sha256");
  h.update(baseImage);
  h.update(customCloudInit ?? "");
  return h.digest("hex").slice(0, 16);
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

async function generateTempKeyPair(
  dir: string,
): Promise<{ keyPath: string; pubKey: string }> {
  const keyPath = join(dir, "bake_key");
  await exec("ssh-keygen", ["-t", "ed25519", "-f", keyPath, "-N", "", "-q"]);
  const pubKey = (await readFile(`${keyPath}.pub`, "utf-8")).trim();
  return { keyPath, pubKey };
}

function bakeSshArgs(keyPath: string, port: number, host: string): string[] {
  return [
    ...SSH_OPTS,
    "-o",
    "ConnectTimeout=5",
    "-o",
    "BatchMode=yes",
    "-i",
    keyPath,
    "-p",
    String(port),
    `dev@${host}`,
  ];
}

function waitForCloudInitDone(
  host: string,
  port: number,
  keyPath: string,
  timeoutSeconds: number = 600,
): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1000;

  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() > deadline) {
        reject(
          new Error(`cloud-init did not finish within ${timeoutSeconds}s`),
        );
        return;
      }

      const child = spawn(
        "ssh",
        [...bakeSshArgs(keyPath, port, host), "cloud-init status --wait"],
        { stdio: ["ignore", "pipe", "ignore"] },
      );

      let stdout = "";
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });

      child.on("close", (code) => {
        if ((code === 0 || code === 2) && stdout.includes("done")) {
          resolve();
        } else {
          setTimeout(attempt, 5000);
        }
      });
      child.on("error", () => {
        setTimeout(attempt, 5000);
      });
    }
    attempt();
  });
}

function shutdownVm(
  host: string,
  port: number,
  keyPath: string,
): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(
      "ssh",
      [...bakeSshArgs(keyPath, port, host), "sudo poweroff"],
      { stdio: "ignore" },
    );
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

function waitForPidExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      try {
        process.kill(pid, 0);
      } catch {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error("VM did not shut down in time"));
        return;
      }
      setTimeout(check, 1000);
    }
    check();
  });
}

export async function ensureBakedImage(config: ProjectConfig): Promise<string> {
  const provider = resolveImage(config.settings.image);
  const baseImage = await provider.ensureBaseImage();
  const hash = bakeHash(baseImage, config.customCloudInit);
  const bakedPath = join(BAKED_DIR, `baked-${hash}.qcow2`);

  if (await fileExists(bakedPath)) {
    console.log(`Using baked image: ${bakedPath}`);
    return bakedPath;
  }

  console.log("Baking image...");
  await mkdir(BAKED_DIR, { recursive: true });

  const tmpDir = `${bakedPath}.tmp.d`;
  await mkdir(tmpDir, { recursive: true });

  const seedIso = join(tmpDir, "seed.iso");
  const sshPort = await allocateSshPort();
  const { keyPath, pubKey } = await generateTempKeyPair(tmpDir);

  await createSeedIso(seedIso, {
    hostname: "bake-tmp",
    sshAuthorizedKeys: [pubKey],
    customCloudInit: config.customCloudInit,
  });

  const pid = await launchVm({
    name: "bake-tmp",
    stateDir: tmpDir,
    baseImage,
    seedIso,
    sshPort,
  });

  console.log(`Bake VM started (PID: ${pid}, SSH port: ${sshPort})`);

  try {
    console.log("Waiting for SSH...");
    await waitForSsh({
      host: "localhost",
      port: sshPort,
      identityFile: keyPath,
    });

    console.log("Waiting for cloud-init to finish...");
    await waitForCloudInitDone("localhost", sshPort, keyPath);

    console.log("Shutting down bake VM...");
    await shutdownVm("localhost", sshPort, keyPath);
    await waitForPidExit(pid, 30_000);
  } catch (err) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
    throw err;
  }

  const overlayPath = join(tmpDir, "overlay.qcow2");
  const tmpBaked = `${bakedPath}.tmp`;
  await exec("qemu-img", [
    "convert",
    "-f",
    "qcow2",
    "-O",
    "qcow2",
    "-c",
    overlayPath,
    tmpBaked,
  ]);
  await rename(tmpBaked, bakedPath);
  await rm(tmpDir, { recursive: true }).catch(() => {});

  console.log(`Baked image ready: ${bakedPath}`);
  return bakedPath;
}

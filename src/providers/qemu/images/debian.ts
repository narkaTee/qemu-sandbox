import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, arch } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { sha512 } from "../../../sha512.ts";
import { download } from "../../../download.ts";
import { createSeedIso } from "../../../cloud-init.ts";
import { allocateSshPort } from "../../../ssh-port.ts";
import { exec } from "../../../exec.ts";
import { generateSshKeyPair } from "../../../ssh-keys.ts";
import { SSH_OPTS, waitForSsh } from "../../../ssh.ts";
import type { QemuImage, QemuImageResult } from "./types.ts";
import type { ProjectConfig } from "../../../project-config.ts";
import { loadCustomCloudInit } from "../config.ts";
import { launchVm } from "../runtime.ts";

const BASE_URL = "https://cloud.debian.org/images/cloud/trixie/latest";
const CACHE_DIR = join(homedir(), ".cache", "qemu-sandbox", "images", "debian");
const BAKED_DIR = join(homedir(), ".cache", "qemu-sandbox", "images", "baked");

function getArch(): string {
  const a = arch();
  if (a === "x64") return "amd64";
  if (a === "arm64") return "arm64";
  throw new Error(`Unsupported architecture: ${a}`);
}

function imageFilename(): string {
  return `debian-13-generic-${getArch()}.qcow2`;
}

function parseSha512Sums(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^([0-9a-f]+)\s+(.+)$/);
    if (match) entries.set(match[2], match[1]);
  }
  return entries;
}

async function fetchSha512Sums(): Promise<string> {
  const res = await fetch(`${BASE_URL}/SHA512SUMS`);
  if (!res.ok) throw new Error(`Failed to fetch SHA512SUMS: ${res.status}`);
  return res.text();
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function ensureDebianImage(): Promise<string> {
  const filename = imageFilename();
  const imagePath = join(CACHE_DIR, filename);
  const checksumsPath = join(CACHE_DIR, "SHA512SUMS");

  await mkdir(CACHE_DIR, { recursive: true });

  if (!(await fileExists(checksumsPath))) {
    console.log("Fetching SHA512SUMS...");
    await writeFile(checksumsPath, await fetchSha512Sums());
  }

  const sums = parseSha512Sums(await readFile(checksumsPath, "utf-8"));
  const expectedHash = sums.get(filename);
  if (!expectedHash)
    throw new Error(`No SHA512 checksum found for ${filename}`);

  if (await fileExists(imagePath)) {
    console.log(`Verifying cached image: ${imagePath}`);
    const actual = await sha512(imagePath);
    if (actual === expectedHash) {
      console.log("Checksum OK.");
      return imagePath;
    }
    console.log("Checksum mismatch, re-downloading...");
  }

  const url = `${BASE_URL}/${filename}`;
  console.log(`Downloading ${url}`);
  await download(url, imagePath);

  console.log("Verifying SHA512 checksum...");
  const actualHash = await sha512(imagePath);
  if (actualHash !== expectedHash) {
    await unlink(imagePath);
    throw new Error(
      `Checksum mismatch!\n  expected: ${expectedHash}\n  actual:   ${actualHash}`,
    );
  }
  console.log("Checksum OK.");

  return imagePath;
}

export function bakeHash(
  baseImage: string,
  customCloudInit: string | null,
): string {
  const h = createHash("sha256");
  h.update(baseImage);
  h.update(customCloudInit ?? "");
  return h.digest("hex").slice(0, 16);
}

async function generateTempKeyPair(
  dir: string,
): Promise<{ keyPath: string; pubKey: string }> {
  const keyPath = join(dir, "bake_key");
  const keyPair = await generateSshKeyPair(keyPath);
  return { keyPath: keyPair.privateKeyPath, pubKey: keyPair.publicKey };
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
        [...bakeSshArgs(keyPath, port, host), "cloud-init status"],
        { stdio: ["ignore", "pipe", "ignore"] },
      );

      let stdout = "";
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });

      child.on("close", (code) => {
        if (code !== null && stdout.includes("done")) {
          resolve();
        } else if (
          code !== null &&
          (stdout.includes("error") || stdout.includes("degraded"))
        ) {
          console.warn(
            "cloud-init finished with errors; continuing bake anyway",
          );
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

async function bakeDebian(config: ProjectConfig): Promise<QemuImageResult> {
  const baseImage = await ensureDebianImage();
  const customCloudInit = await loadCustomCloudInit(config);
  const hash = bakeHash(baseImage, customCloudInit);
  const bakedPath = join(BAKED_DIR, `baked-${hash}.qcow2`);

  if (await fileExists(bakedPath)) {
    console.log(`Using baked image: ${bakedPath}`);
    return { diskImage: bakedPath, useFwCfg: false };
  }

  console.log("Baking image...");
  await mkdir(BAKED_DIR, { recursive: true });

  const tmpDir = `${bakedPath}.tmp.d`;
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  const seedIso = join(tmpDir, "seed.iso");
  const sshPort = await allocateSshPort();
  const { keyPath, pubKey } = await generateTempKeyPair(tmpDir);

  await createSeedIso(seedIso, {
    hostname: "bake-tmp",
    sshAuthorizedKeys: [pubKey],
    customCloudInit,
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
  return { diskImage: bakedPath, useFwCfg: false };
}

export const debianImage: QemuImage = {
  name: "debian-13",
  bake: bakeDebian,
};

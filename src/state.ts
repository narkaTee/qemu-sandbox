import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const VMS_DIR = join(homedir(), ".cache", "qemu-sandbox", "vms");

export function sandboxName(dir: string = process.cwd()): string {
  const absPath = resolve(dir);
  const base = basename(absPath).replace(/[^a-zA-Z0-9]/g, "-");
  const hash = createHash("sha256").update(absPath).digest("hex").slice(0, 8);
  return `sandbox-${base}-${hash}`;
}

export function stateDir(name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid sandbox name: ${name}`);
  }
  return join(VMS_DIR, name);
}

async function readStateInt(
  name: string,
  filename: string,
): Promise<number | null> {
  try {
    const raw = await readFile(join(stateDir(name), filename), "utf-8");
    const value = parseInt(raw.trim(), 10);
    return Number.isNaN(value) ? null : value;
  } catch {
    return null;
  }
}

export function readPid(name: string): Promise<number | null> {
  return readStateInt(name, "qemu.pid");
}

export function readSshPort(name: string): Promise<number | null> {
  return readStateInt(name, "ssh.port");
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function isRunning(name: string): Promise<boolean> {
  const pid = await readPid(name);
  return pid !== null && isProcessRunning(pid);
}

export async function removeState(name: string): Promise<void> {
  const dir = stateDir(name);
  try {
    await rm(dir, { recursive: true });
  } catch {
    // already gone
  }
}

export interface SandboxInfo {
  name: string;
  pid: number | null;
  sshPort: number | null;
  running: boolean;
}

export async function listAll(): Promise<SandboxInfo[]> {
  let entries: string[];
  try {
    entries = await readdir(VMS_DIR);
  } catch {
    return [];
  }

  const results: SandboxInfo[] = [];
  for (const name of entries) {
    const dir = join(VMS_DIR, name);
    const info = await stat(dir);
    if (!info.isDirectory()) continue;

    const pid = await readPid(name);
    const sshPort = await readSshPort(name);
    const running = pid !== null && isProcessRunning(pid);
    results.push({ name, pid, sshPort, running });
  }
  return results;
}

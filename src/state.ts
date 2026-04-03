import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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

interface SandboxState {
  pid: number;
  sshPort: number;
}

async function readState(name: string): Promise<SandboxState | null> {
  try {
    const raw = await readFile(join(stateDir(name), "state.json"), "utf-8");
    const data = JSON.parse(raw);
    if (typeof data.pid !== "number" || typeof data.sshPort !== "number") {
      return null;
    }
    return data as SandboxState;
  } catch {
    return null;
  }
}

export async function writeState(
  name: string,
  state: SandboxState,
): Promise<void> {
  const dir = stateDir(name);
  const tmp = join(dir, "state.json.tmp");
  const dest = join(dir, "state.json");
  await writeFile(tmp, JSON.stringify(state));
  await rename(tmp, dest);
}

export async function readPid(name: string): Promise<number | null> {
  const state = await readState(name);
  return state?.pid ?? null;
}

export async function readSshPort(name: string): Promise<number | null> {
  const state = await readState(name);
  return state?.sshPort ?? null;
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
  const state = await readState(name);
  return state !== null && isProcessRunning(state.pid);
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
  for (const entry of entries) {
    const dir = join(VMS_DIR, entry);
    const info = await stat(dir);
    if (!info.isDirectory()) continue;

    const state = await readState(entry).catch(() => null);
    const pid = state?.pid ?? null;
    const sshPort = state?.sshPort ?? null;
    const running = pid !== null && isProcessRunning(pid);
    results.push({ name: entry, pid, sshPort, running });
  }
  return results;
}

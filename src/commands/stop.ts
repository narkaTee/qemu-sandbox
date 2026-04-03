import type { ParsedArgs } from "../bin/sandbox.ts";
import {
  isRunning,
  listAll,
  readPid,
  removeState,
  sandboxName,
  isProcessRunning,
} from "../state.ts";

function killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  try {
    process.kill(pid, signal);
  } catch {
    // already dead
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function stopOne(name: string): Promise<void> {
  const running = await isRunning(name);
  if (!running) {
    console.log(`${name}: not running, cleaning up state`);
    await removeState(name);
    return;
  }

  const pid = await readPid(name);
  if (pid === null) {
    await removeState(name);
    return;
  }

  console.log(`${name}: stopping (PID: ${pid})...`);
  killProcess(pid);

  const exited = await waitForExit(pid, 10_000);
  if (!exited) {
    console.log(`${name}: force killing...`);
    killProcess(pid, "SIGKILL");
    await waitForExit(pid, 2_000);
  }

  await removeState(name);
  console.log(`${name}: stopped`);
}

export async function stop(args: ParsedArgs): Promise<void> {
  if (args.flags.all) {
    const sandboxes = await listAll();
    if (sandboxes.length === 0) {
      console.log("No sandboxes to stop");
      return;
    }
    for (const sb of sandboxes) {
      await stopOne(sb.name);
    }
    return;
  }

  await stopOne(sandboxName());
}

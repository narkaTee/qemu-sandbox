import { listAll } from "../state.ts";

export async function list(): Promise<void> {
  const sandboxes = await listAll();

  if (sandboxes.length === 0) {
    console.log("No sandboxes");
    return;
  }

  console.log(`${"NAME".padEnd(30)} ${"PROVIDER".padEnd(9)} ${"STATUS".padEnd(10)} ${"PID".padEnd(8)} SSH_PORT`);
  for (const sb of sandboxes) {
    const status = sb.running ? "Running" : "Stopped";
    const pid = sb.pid?.toString() ?? "-";
    const port = sb.sshPort?.toString() ?? "-";
    console.log(`${sb.name.padEnd(30)} ${sb.provider.padEnd(9)} ${status.padEnd(10)} ${pid.padEnd(8)} ${port}`);
  }
}

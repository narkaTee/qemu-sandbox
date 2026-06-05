import { spawn } from "node:child_process";
import {
  sandboxName,
  isRunning,
  readSshPort,
  readSshHost,
  readSshUser,
  readSshIdentityFile,
} from "../state.ts";
import { SSH_OPTS } from "../ssh.ts";
import { loadProjectConfig } from "../project-config.ts";
import type { ParsedArgs } from "../bin/sandbox.ts";

function rsync(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("rsync", args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`rsync exited with code ${code}`));
      else resolve();
    });
    child.on("error", reject);
  });
}

export async function sync(args: ParsedArgs): Promise<void> {
  const direction = args.subcommand;
  if (direction !== "up" && direction !== "down") {
    throw new Error("Usage: sandbox sync [up|down]");
  }

  const config = await loadProjectConfig();
  if (config.settings["mount-workspace"]) {
    throw new Error(
      "sync is disabled when mount-workspace is enabled (files are already shared via virtio mount)",
    );
  }

  const name = sandboxName();
  if (!(await isRunning(name))) {
    throw new Error("No sandbox running for current directory");
  }

  const port = await readSshPort(name);
  const host = await readSshHost(name);
  const user = await readSshUser(name);
  const identityFile = await readSshIdentityFile(name);
  if (!port) {
    throw new Error("Could not determine SSH port");
  }

  const sshCmd = [
    "ssh",
    ...SSH_OPTS,
    ...(identityFile ? ["-i", identityFile] : []),
    "-p",
    String(port),
  ].join(" ");
  const remote = `${user}@${host}:/home/dev/workspace/`;

  const common = ["-hzav", "--no-o", "--no-g", "--delete", "-e", sshCmd];

  if (direction === "up") {
    console.log("Uploading workspace to sandbox...");
    await rsync([...common, "./", remote]);
  } else {
    console.log("Downloading workspace from sandbox...");
    await rsync([...common, remote, "./"]);
  }

  console.log("Sync complete");
}

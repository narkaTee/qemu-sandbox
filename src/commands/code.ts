import { execFile } from "node:child_process";
import { sandboxName, isRunning, readSshPort } from "../state.ts";
import { openUrl } from "../open-url.ts";
import type { ParsedArgs } from "../bin/sandbox.ts";

function hasCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [cmd], (err) => resolve(!err));
  });
}

export async function code(_args: ParsedArgs): Promise<void> {
  const name = sandboxName();
  if (!(await isRunning(name))) {
    throw new Error("No sandbox running for current directory");
  }

  const port = await readSshPort(name);
  if (!port) {
    throw new Error("Could not determine SSH port");
  }

  const remote = `ssh-remote+dev@localhost:${port}/home/dev/workspace`;
  console.log(`Opening Visual Studio Code on ${name}...`);

  if (await hasCommand("code")) {
    return new Promise((resolve, reject) => {
      execFile("code", ["--folder-uri", `vscode-remote://${remote}`], (err) => {
        if (err) reject(new Error(`Failed to launch VS Code: ${err.message}`));
        else resolve();
      });
    });
  }

  await openUrl(`vscode://vscode-remote/${remote}`);
}

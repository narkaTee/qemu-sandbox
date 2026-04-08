import { spawn } from "node:child_process";
import type { FileCopy } from "./agent-mounts.ts";

export const SSH_OPTS = [
  "-o",
  "StrictHostKeyChecking=no",
  "-o",
  "UserKnownHostsFile=/dev/null",
  "-o",
  "LogLevel=ERROR",
];

export function enterSsh(
  host: string,
  port: number,
  user: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ssh",
      [...SSH_OPTS, "-p", String(port), `${user}@${host}`],
      { stdio: "inherit" },
    );
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", reject);
  });
}

function scp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("scp", args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`scp exited with code ${code}`));
      else resolve();
    });
    child.on("error", reject);
  });
}

function sshExec(
  host: string,
  port: number,
  user: string,
  command: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ssh",
      [...SSH_OPTS, "-p", String(port), `${user}@${host}`, command],
      { stdio: "inherit" },
    );
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`ssh command exited with code ${code}`));
      else resolve();
    });
    child.on("error", reject);
  });
}

export async function copyFilesToVm(
  host: string,
  port: number,
  user: string,
  copies: FileCopy[],
): Promise<void> {
  const dirs = new Set(
    copies.map((c) => {
      const lastSlash = c.guest.lastIndexOf("/");
      return lastSlash > 0 ? c.guest.slice(0, lastSlash) : "/";
    }),
  );

  if (dirs.size > 0) {
    await sshExec(host, port, user, `mkdir -p ${[...dirs].join(" ")}`);
  }

  for (const copy of copies) {
    await scp([
      ...SSH_OPTS,
      "-P",
      String(port),
      copy.host,
      `${user}@${host}:${copy.guest}`,
    ]);
  }
}

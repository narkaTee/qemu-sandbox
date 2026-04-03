import { spawn } from "node:child_process";

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

import { execFile } from "node:child_process";

export function getSshAgentKeys(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("ssh-add", ["-L"], (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve([]);
        return;
      }
      resolve(
        stdout
          .trim()
          .split("\n")
          .filter((line) => line.length > 0),
      );
    });
  });
}

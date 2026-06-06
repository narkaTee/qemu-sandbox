import { execFile, execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

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
          .filter((line) => line.length > 0)
      );
    });
  });
}

export async function generateSshKeyPair(path: string): Promise<{ privateKeyPath: string; publicKey: string }> {
  await rm(path, { force: true });
  await rm(`${path}.pub`, { force: true });
  execFileSync("ssh-keygen", ["-t", "ed25519", "-f", path, "-N", "", "-q"], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
  const publicKey = (await readFile(`${path}.pub`, "utf-8")).trim();
  return { privateKeyPath: path, publicKey };
}

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectConfig } from "../../project-config.ts";
import { waitForSsh } from "../../ssh.ts";
import type { SandboxProvider } from "../types.ts";
import { ensureGondolinImage } from "./assets.ts";

interface GondolinReady {
  pid?: number;
  sshPort?: number;
  identityFile?: string;
  error?: string;
}

async function waitForGondolinReady(path: string, timeoutMs: number): Promise<GondolinReady> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(path, "utf-8")) as GondolinReady;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Timed out waiting for Gondolin to start");
}

export const gondolinProvider: SandboxProvider = {
  name: "gondolin",
  async start(config: ProjectConfig, name: string, stateDir: string) {
    await mkdir(stateDir, { recursive: true });
    const runnerConfigPath = join(stateDir, "gondolin-runner.json");
    const readyPath = join(stateDir, "gondolin-ready.json");
    await rm(readyPath, { force: true });
    await writeFile(
      runnerConfigPath,
      JSON.stringify({
        name,
        projectRoot: config.projectRoot,
        stateReadyPath: readyPath,
      })
    );

    const runnerPath = fileURLToPath(new URL("../../bin/gondolin-runner.ts", import.meta.url));
    const child = spawn(process.execPath, ["--experimental-strip-types", runnerPath, runnerConfigPath], {
      detached: true,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        PATH: `${process.env.PATH ?? ""}:/usr/sbin:/sbin`,
        TMPDIR: stateDir,
      },
    });
    child.unref();

    const ready = await waitForGondolinReady(readyPath, 300_000);
    if (ready.error) throw new Error(ready.error);
    if (!ready.sshPort) throw new Error("Gondolin started without SSH port");

    await waitForSsh({
      host: "127.0.0.1",
      port: ready.sshPort,
      user: "dev",
      identityFile: ready.identityFile,
      timeoutSeconds: 30,
    });

    console.log(`Gondolin started (PID: ${ready.pid ?? child.pid}, ssh port: ${ready.sshPort})`);

    return {
      pid: ready.pid ?? child.pid ?? process.pid,
      sshHost: "localhost",
      sshPort: ready.sshPort,
      sshUser: "dev",
      sshIdentityFile: ready.identityFile,
    };
  },
  async bake(config: ProjectConfig) {
    await ensureGondolinImage(config);
  },
};

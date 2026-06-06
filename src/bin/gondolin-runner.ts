#!/usr/bin/env -S node --experimental-strip-types

import { dirname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createGondolinVm } from "../providers/gondolin/runtime.ts";
import { loadProjectConfig } from "../project-config.ts";
import { waitForSsh } from "../ssh.ts";
import { writeState } from "../state.ts";

interface RunnerConfig {
  name: string;
  projectRoot: string;
  stateReadyPath: string;
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) throw new Error("missing runner config path");

  const runner = JSON.parse(await readFile(configPath, "utf-8")) as RunnerConfig;
  const projectConfig = await loadProjectConfig(runner.projectRoot);
  const vm = await createGondolinVm(runner.name, projectConfig, dirname(configPath));

  try {
    await vm.fs.mkdir("/home/dev/workspace", { recursive: true }).catch(() => {});
    const addUser = await vm.exec(["/bin/sh", "-lc", "id dev >/dev/null 2>&1 || adduser -D -s /bin/sh dev"]);
    if (!addUser.ok) throw new Error(`failed to create dev user: ${addUser.stderr}`);

    const workspaceAccess = await vm.exec([
      "/bin/sh",
      "-lc",
      "chown dev:dev /home/dev/workspace && chmod u+rwx /home/dev/workspace",
    ]);
    if (!workspaceAccess.ok) {
      throw new Error(`failed to prepare workspace mount: ${workspaceAccess.stderr}`);
    }

    const ssh = await vm.enableSsh({ user: "dev", listenHost: "127.0.0.1" });
    const pid = process.pid;
    await writeState(runner.name, {
      pid,
      sshPort: ssh.port,
      provider: "gondolin",
      sshHost: ssh.host,
      sshUser: ssh.user,
      sshIdentityFile: ssh.identityFile,
    });
    await writeFile(
      runner.stateReadyPath,
      JSON.stringify({
        pid,
        sshPort: ssh.port,
        identityFile: ssh.identityFile,
      })
    );
    await waitForSsh({
      host: ssh.host,
      port: ssh.port,
      user: ssh.user,
      identityFile: ssh.identityFile,
      timeoutSeconds: 30,
    });
    await new Promise<void>((resolve) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
    });
  } finally {
    await vm.close().catch(() => {});
  }
}

main().catch(async (err) => {
  const configPath = process.argv[2];
  if (configPath) {
    try {
      const runner = JSON.parse(await readFile(configPath, "utf-8")) as RunnerConfig;
      await writeFile(runner.stateReadyPath, JSON.stringify({ error: err.message }));
    } catch {}
  }
  console.error(`gondolin-runner: ${err.message}`);
  process.exit(1);
});

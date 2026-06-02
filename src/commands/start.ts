import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSeedIso } from "../cloud-init.ts";
import { launchVm, waitForSsh } from "../qemu.ts";
import { enterSsh, copyFilesToVm } from "../ssh.ts";
import { getSshAgentKeys } from "../ssh-keys.ts";
import { allocateSshPort } from "../ssh-port.ts";
import {
  sandboxName,
  stateDir,
  isRunning,
  readSshPort,
  writeState,
  readSshIdentityFile,
} from "../state.ts";
import { loadProjectConfig } from "../project-config.ts";
import { ensureBakedImage } from "../bake.ts";
import type { ParsedArgs } from "../bin/sandbox.ts";

interface GondolinReady {
  pid?: number;
  sshPort?: number;
  identityFile?: string;
  error?: string;
}

async function waitForGondolinReady(
  path: string,
  timeoutMs: number,
): Promise<GondolinReady> {
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

async function startGondolin(
  name: string,
  sd: string,
  projectRoot: string,
): Promise<void> {
  await mkdir(sd, { recursive: true });
  const runnerConfigPath = join(sd, "gondolin-runner.json");
  const readyPath = join(sd, "gondolin-ready.json");
  await rm(readyPath, { force: true });
  await writeFile(
    runnerConfigPath,
    JSON.stringify({ name, projectRoot, stateReadyPath: readyPath }),
  );

  const runnerPath = fileURLToPath(
    new URL("../bin/gondolin-runner.ts", import.meta.url),
  );
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", runnerPath, runnerConfigPath],
    {
      detached: true,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        PATH: `${process.env.PATH ?? ""}:/usr/sbin:/sbin`,
        TMPDIR: sd,
      },
    },
  );
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
  console.log(
    `Gondolin started (PID: ${ready.pid ?? child.pid}, ssh port: ${ready.sshPort})`,
  );
}

export async function start(_args: ParsedArgs): Promise<void> {
  const name = sandboxName();

  if (await isRunning(name)) {
    const port = await readSshPort(name);
    const identityFile = (await readSshIdentityFile(name)) ?? undefined;
    console.log(`${name} is already running (ssh port: ${port})`);
    await enterSsh("localhost", port!, "dev", identityFile);
    return;
  }

  const sd = stateDir(name);
  const config = await loadProjectConfig();

  if (config.settings.backend === "gondolin") {
    console.log("Starting Gondolin...");
    await startGondolin(name, sd, config.projectRoot);
    const port = await readSshPort(name);
    const identityFile = (await readSshIdentityFile(name)) ?? undefined;
    if (config.copies.length > 0) {
      console.log(`Copying ${config.copies.length} file(s) to VM...`);
      await copyFilesToVm(
        "localhost",
        port!,
        "dev",
        config.copies,
        identityFile,
      );
    }
    await enterSsh("localhost", port!, "dev", identityFile);
    return;
  }

  const image = await ensureBakedImage(config);
  console.log(`Image ready: ${image.diskImage}`);

  const sshKeys = await getSshAgentKeys();
  if (sshKeys.length > 0) {
    console.log(`Found ${sshKeys.length} SSH key(s) from agent`);
  }

  const sshPort = await allocateSshPort();
  console.log(`Allocated SSH port: ${sshPort}`);

  let seedIso: string | undefined;
  let fwCfg: Record<string, string> | undefined;

  if (image.useFwCfg) {
    fwCfg = { hostname: name };
    if (sshKeys.length > 0) {
      fwCfg.ssh_keys = Buffer.from(sshKeys.join("\n")).toString("base64");
    }
  } else {
    seedIso = join(sd, "seed.iso");
    console.log("Generating cloud-init seed ISO...");
    await createSeedIso(seedIso, {
      hostname: name,
      sshAuthorizedKeys: sshKeys,
      mounts: config.mounts,
    });
  }

  console.log("Starting QEMU...");
  const bootStart = Date.now();
  const pid = await launchVm({
    name,
    stateDir: sd,
    baseImage: image.diskImage,
    seedIso,
    sshPort,
    memory: config.settings.memory ?? undefined,
    cpus: config.settings.cpus ?? undefined,
    mounts: config.mounts,
    fwCfg,
  });
  await writeState(name, { pid, sshPort });
  console.log(`QEMU started (PID: ${pid})`);

  console.log("Waiting for SSH...");
  await waitForSsh({ host: "localhost", port: sshPort });
  const bootTime = ((Date.now() - bootStart) / 1000).toFixed(1);
  console.log(`VM ready in ${bootTime}s (ssh port: ${sshPort})`);

  if (config.copies.length > 0) {
    console.log(`Copying ${config.copies.length} file(s) to VM...`);
    await copyFilesToVm("localhost", sshPort, "dev", config.copies);
  }

  await enterSsh("localhost", sshPort, "dev");
}

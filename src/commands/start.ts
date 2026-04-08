import { join } from "node:path";
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
} from "../state.ts";
import { loadProjectConfig } from "../project-config.ts";
import { ensureBakedImage } from "../bake.ts";
import type { ParsedArgs } from "../bin/sandbox.ts";

export async function start(_args: ParsedArgs): Promise<void> {
  const name = sandboxName();

  if (await isRunning(name)) {
    const port = await readSshPort(name);
    console.log(`${name} is already running (ssh port: ${port})`);
    await enterSsh("localhost", port!, "dev");
    return;
  }

  const sd = stateDir(name);
  const config = await loadProjectConfig();

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

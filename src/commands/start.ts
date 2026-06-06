import { mkdir } from "node:fs/promises";
import { enterSsh, copyFilesToVm, waitForSsh } from "../ssh.ts";
import {
  sandboxName,
  stateDir,
  isRunning,
  readSshPort,
  writeState,
  readSshIdentityFile,
  readSshHost,
  readSshUser,
} from "../state.ts";
import { loadProjectConfig } from "../project-config.ts";
import { resolveProvider } from "../providers/registry.ts";
import type { ParsedArgs } from "../bin/sandbox.ts";

export async function start(_args: ParsedArgs): Promise<void> {
  const name = sandboxName();

  if (await isRunning(name)) {
    const host = await readSshHost(name);
    const port = await readSshPort(name);
    const user = await readSshUser(name);
    const identityFile = (await readSshIdentityFile(name)) ?? undefined;
    console.log(`${name} is already running (ssh port: ${port})`);
    if (port === null) throw new Error("Could not read SSH port for running sandbox");
    await enterSsh(host, port, user, identityFile);
    return;
  }

  const sd = stateDir(name);
  await mkdir(sd, { recursive: true });
  const config = await loadProjectConfig();
  const provider = resolveProvider(config.settings.provider);
  const started = await provider.start(config, name, sd);

  await writeState(name, {
    pid: started.pid,
    sshPort: started.sshPort,
    provider: provider.name,
    sshHost: started.sshHost,
    sshUser: started.sshUser,
    sshIdentityFile: started.sshIdentityFile,
  });

  console.log("Waiting for SSH...");
  await waitForSsh({
    host: started.sshHost,
    port: started.sshPort,
    user: started.sshUser,
    identityFile: started.sshIdentityFile,
  });
  console.log(`VM ready (ssh port: ${started.sshPort})`);

  if (config.copies.length > 0) {
    console.log(`Copying ${config.copies.length} file(s) to VM...`);
    await copyFilesToVm(started.sshHost, started.sshPort, started.sshUser, config.copies, started.sshIdentityFile);
  }

  await enterSsh(started.sshHost, started.sshPort, started.sshUser, started.sshIdentityFile);
}

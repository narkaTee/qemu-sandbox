import {
  sandboxName,
  isRunning,
  readPid,
  readSshPort,
  readProvider,
  readSshIdentityFile,
  readSshHost,
  readSshUser,
} from "../state.ts";

export async function info(): Promise<void> {
  const name = sandboxName();
  const running = await isRunning(name);
  const pid = await readPid(name);
  const port = await readSshPort(name);
  const provider = await readProvider(name);
  const identityFile = await readSshIdentityFile(name);
  const host = await readSshHost(name);
  const user = await readSshUser(name);

  console.log(`Name:     ${name}`);
  console.log(`Status:   ${running ? "Running" : "Stopped"}`);
  console.log(`Provider: ${provider}`);
  console.log(`PID:      ${pid ?? "-"}`);
  console.log(`SSH port: ${port ?? "-"}`);

  if (running && port) {
    console.log(
      `SSH cmd:  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${identityFile ? `-i ${identityFile} ` : ""}-p ${port} ${user}@${host}`,
    );
  }
}

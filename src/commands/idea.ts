import type { ParsedArgs } from "../bin/sandbox.ts";
import { openUrl } from "../open-url.ts";
import { isRunning, readSshHost, readSshPort, readSshUser, sandboxName } from "../state.ts";

export async function idea(_args: ParsedArgs): Promise<void> {
  const name = sandboxName();
  if (!(await isRunning(name))) {
    throw new Error("No sandbox running for current directory");
  }

  const port = await readSshPort(name);
  const host = await readSshHost(name);
  const user = await readSshUser(name);
  if (!port) {
    throw new Error("Could not determine SSH port");
  }

  const url = `jetbrains://gateway/ssh/environment?h=${host}&u=${user}&p=${port}&launchIde=true&ideHint=IU&projectHint=/home/dev/workspace`;
  console.log(`Opening IntelliJ IDEA on ${name}...`);
  await openUrl(url);
}

import { join } from "node:path";
import { createSeedIso } from "../../cloud-init.ts";
import { generateSshKeyPair, getSshAgentKeys } from "../../ssh-keys.ts";
import { allocateSshPort } from "../../ssh-port.ts";
import type { ProjectConfig } from "../../project-config.ts";
import type { SandboxProvider } from "../types.ts";
import { launchVm } from "./runtime.ts";
import { loadCustomCloudInit } from "./config.ts";
import { resolveQemuImage } from "./images/registry.ts";

export const qemuProvider: SandboxProvider = {
  name: "qemu",
  async start(config: ProjectConfig, name: string, stateDir: string) {
    const image = await resolveQemuImage(config.settings.qemu.image).bake(config);
    console.log(`Image ready: ${image.diskImage}`);

    let sshKeys = await getSshAgentKeys();
    let sshIdentityFile: string | undefined;
    if (sshKeys.length > 0) {
      console.log(`Found ${sshKeys.length} SSH key(s) from agent`);
    } else {
      const fallback = await generateSshKeyPair(join(stateDir, "id_ed25519"));
      sshKeys = [fallback.publicKey];
      sshIdentityFile = fallback.privateKeyPath;
      console.log(`Generated SSH identity file: ${sshIdentityFile}`);
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
      const customCloudInit = await loadCustomCloudInit(config);
      seedIso = `${stateDir}/seed.iso`;
      console.log("Generating cloud-init seed ISO...");
      await createSeedIso(seedIso, {
        hostname: name,
        sshAuthorizedKeys: sshKeys,
        mounts: config.mounts,
        customCloudInit,
      });
    }

    console.log("Starting QEMU...");
    const pid = await launchVm({
      name,
      stateDir,
      baseImage: image.diskImage,
      seedIso,
      sshPort,
      memory: config.settings.memory ?? undefined,
      cpus: config.settings.cpus ?? undefined,
      mounts: config.mounts,
      fwCfg,
    });

    console.log(`QEMU started (PID: ${pid})`);
    return {
      pid,
      sshHost: "localhost",
      sshPort,
      sshUser: "dev",
      sshIdentityFile,
    };
  },
  async bake(config: ProjectConfig) {
    await resolveQemuImage(config.settings.qemu.image).bake(config);
  },
};

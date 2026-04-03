import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectConfig, resolveMounts } from "../src/project-config.ts";

describe("loadProjectConfig", () => {
  let dir: string;

  after(async () => {
    if (dir) await rm(dir, { recursive: true });
  });

  it("returns defaults when no config dir exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const config = await loadProjectConfig(dir);
    assert.equal(config.customCloudInit, null);
    assert.deepEqual(config.mounts, []);
    assert.equal(config.settings.image, null);
    assert.equal(config.settings.memory, null);
    assert.equal(config.settings.cpus, null);
  });

  it("loads cloud-init.yaml when present", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "cloud-init.yaml"),
      "packages:\n  - vim\n",
    );

    const config = await loadProjectConfig(dir);
    assert.equal(config.customCloudInit, "packages:\n  - vim\n");
  });

  it("loads sandbox.yaml settings", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "sandbox.yaml"),
      "image: debian-13\nmemory: 8192\ncpus: 8\n",
    );

    const config = await loadProjectConfig(dir);
    assert.equal(config.settings.image, "debian-13");
    assert.equal(config.settings.memory, 8192);
    assert.equal(config.settings.cpus, 8);
  });

  it("loads mounts.yaml and resolves paths against project root", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "mounts.yaml"),
      "- host: .\n  guest: /home/dev/workspace\n- host: data\n  guest: /mnt/data\n  readonly: true\n",
    );

    const config = await loadProjectConfig(dir);
    assert.equal(config.mounts.length, 2);
    assert.equal(config.mounts[0].host, dir);
    assert.equal(config.mounts[0].guest, "/home/dev/workspace");
    assert.equal(config.mounts[0].readonly, false);
    assert.equal(config.mounts[1].host, join(dir, "data"));
    assert.equal(config.mounts[1].guest, "/mnt/data");
    assert.equal(config.mounts[1].readonly, true);
  });
});

describe("resolveMounts", () => {
  it("resolves relative host paths against project root", () => {
    const result = resolveMounts(
      [{ host: "src", guest: "/opt/src", readonly: false }],
      "/projects/myapp",
    );
    assert.equal(result[0].host, "/projects/myapp/src");
    assert.equal(result[0].guest, "/opt/src");
  });
});

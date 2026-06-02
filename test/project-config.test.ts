import { describe, it, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir, homedir } from "node:os";
import {
  loadProjectConfig,
  resolveMounts,
  parseSettings,
  mergeSettings,
  validateGuestPath,
  validateHostPath,
  resolveHostPath,
} from "../src/project-config.ts";

describe("parseSettings", () => {
  it("returns defaults for null/undefined", () => {
    const s = parseSettings(null);
    assert.equal(s.image, null);
    assert.equal(s.memory, null);
    assert.equal(s.cpus, null);
    assert.equal(s["mount-workspace"], false);
    assert.deepEqual(s["mount-agent-configs"], []);
  });

  it("parses all fields", () => {
    const s = parseSettings({
      image: "debian-13",
      memory: 4096,
      cpus: 4,
      "mount-workspace": true,
      "mount-agent-configs": ["claude", "gemini"],
    });
    assert.equal(s.image, "debian-13");
    assert.equal(s.memory, 4096);
    assert.equal(s.cpus, 4);
    assert.equal(s["mount-workspace"], true);
    assert.deepEqual(s["mount-agent-configs"], ["claude", "gemini"]);
  });

  it("ignores invalid types", () => {
    const s = parseSettings({
      image: 123,
      memory: "big",
      cpus: "many",
      "mount-workspace": "yes",
      "mount-agent-configs": "claude",
    });
    assert.equal(s.image, null);
    assert.equal(s.memory, null);
    assert.equal(s.cpus, null);
    assert.equal(s["mount-workspace"], false);
    assert.deepEqual(s["mount-agent-configs"], []);
  });

  it("filters non-string entries in mount-agent-configs", () => {
    const s = parseSettings({
      "mount-agent-configs": ["claude", 42, null, "gemini"],
    });
    assert.deepEqual(s["mount-agent-configs"], ["claude", "gemini"]);
  });
});

describe("mergeSettings", () => {
  const defaults = parseSettings(null);

  it("local overrides global scalar values", () => {
    const global = { ...defaults, image: "debian-13", memory: 4096, cpus: 2 };
    const local = { ...defaults, memory: 8192 };
    const merged = mergeSettings(global, local);
    assert.equal(merged.image, "debian-13");
    assert.equal(merged.memory, 8192);
    assert.equal(merged.cpus, 2);
  });

  it("local null does not override global", () => {
    const global = { ...defaults, image: "debian-13", cpus: 4 };
    const local = { ...defaults };
    const merged = mergeSettings(global, local);
    assert.equal(merged.image, "debian-13");
    assert.equal(merged.cpus, 4);
  });

  it("mount-workspace is true if either is true", () => {
    assert.equal(
      mergeSettings(
        { ...defaults, "mount-workspace": true },
        { ...defaults },
      )["mount-workspace"],
      true,
    );
    assert.equal(
      mergeSettings(
        { ...defaults },
        { ...defaults, "mount-workspace": true },
      )["mount-workspace"],
      true,
    );
    assert.equal(
      mergeSettings(defaults, defaults)["mount-workspace"],
      false,
    );
  });

  it("local mount-agent-configs replaces global when non-empty", () => {
    const global = { ...defaults, "mount-agent-configs": ["claude"] };
    const local = { ...defaults, "mount-agent-configs": ["gemini"] };
    assert.deepEqual(
      mergeSettings(global, local)["mount-agent-configs"],
      ["gemini"],
    );
  });

  it("falls back to global mount-agent-configs when local is empty", () => {
    const global = { ...defaults, "mount-agent-configs": ["claude"] };
    const local = { ...defaults };
    assert.deepEqual(
      mergeSettings(global, local)["mount-agent-configs"],
      ["claude"],
    );
  });
});

describe("validateGuestPath", () => {
  it("accepts absolute guest paths", () => {
    assert.doesNotThrow(() => validateGuestPath("/home/dev/workspace"));
    assert.doesNotThrow(() => validateGuestPath("/mnt/data.with..dots"));
  });

  it("rejects empty guest paths", () => {
    assert.throws(() => validateGuestPath(""), /cannot be empty/);
  });

  it("rejects guest paths with null bytes", () => {
    assert.throws(() => validateGuestPath("/tmp/a\0b"), /null bytes/);
  });

  it("rejects guest paths with control characters", () => {
    assert.throws(() => validateGuestPath("/tmp/a\nb"), /control characters/);
    assert.throws(() => validateGuestPath("/tmp/a\tb"), /control characters/);
    assert.throws(() => validateGuestPath("/tmp/a\rb"), /control characters/);
    assert.throws(() => validateGuestPath("/tmp/a\x7Fb"), /control characters/);
  });

  it("rejects relative guest paths", () => {
    assert.throws(() => validateGuestPath("tmp/data"), /must be absolute/);
  });

  it("rejects parent-directory guest path segments", () => {
    assert.throws(() => validateGuestPath("/tmp/../etc"), /'\.\.' segments/);
    assert.throws(() => validateGuestPath("/.."), /'\.\.' segments/);
  });
});

describe("validateHostPath", () => {
  it("accepts supported host paths", () => {
    assert.doesNotThrow(() => validateHostPath("."));
    assert.doesNotThrow(() => validateHostPath("../shared-libs"));
    assert.doesNotThrow(() => validateHostPath("/tmp/data"));
    assert.doesNotThrow(() => validateHostPath("~"));
    assert.doesNotThrow(() => validateHostPath("~/.config/tool"));
  });

  it("rejects empty host paths", () => {
    assert.throws(() => validateHostPath(""), /cannot be empty/);
  });

  it("rejects host paths with null bytes", () => {
    assert.throws(() => validateHostPath("a\0b"), /null bytes/);
  });

  it("rejects host paths with control characters", () => {
    assert.throws(() => validateHostPath("a\nb"), /control characters/);
    assert.throws(() => validateHostPath("a\tb"), /control characters/);
    assert.throws(() => validateHostPath("a\rb"), /control characters/);
    assert.throws(() => validateHostPath("a\x7Fb"), /control characters/);
  });

  it("rejects unsupported tilde forms", () => {
    assert.throws(() => validateHostPath("~bad/foo"), /unsupported tilde/);
    assert.throws(() => validateHostPath("~user"), /unsupported tilde/);
  });
});

describe("resolveHostPath", () => {
  it("resolves relative paths against project root", () => {
    assert.equal(resolveHostPath("data", "/project"), "/project/data");
    assert.equal(resolveHostPath("../shared", "/project/app"), "/project/shared");
  });

  it("keeps absolute paths absolute", () => {
    assert.equal(resolveHostPath("/tmp/data", "/project"), "/tmp/data");
  });

  it("resolves supported home paths", () => {
    assert.equal(resolveHostPath("~", "/project"), homedir());
    assert.equal(resolveHostPath("~/.config/tool", "/project"), join(homedir(), ".config/tool"));
  });
});

describe("loadProjectConfig", () => {
  let dir: string;
  const homeCleanup: string[] = [];

  after(async () => {
    if (dir) await rm(dir, { recursive: true });
    await Promise.all(
      homeCleanup.map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  it("returns defaults when no config dir exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const config = await loadProjectConfig(dir);
    assert.equal(config.customCloudInit, null);
    assert.deepEqual(config.mounts, []);
    assert.equal(config.settings.image, null);
    assert.equal(config.settings.memory, null);
    assert.equal(config.settings.cpus, null);
    assert.equal(config.settings["mount-workspace"], false);
    assert.deepEqual(config.settings["mount-agent-configs"], []);
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
    await mkdir(join(dir, "data"));
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

  it("derives guest path from ~ host paths", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    const homeMount1 = await mkdtemp(
      join(homedir(), ".config/qemu-sandbox-test-a-"),
    );
    const homeMount2 = await mkdtemp(
      join(homedir(), ".config/qemu-sandbox-test-b-"),
    );
    homeCleanup.push(homeMount1, homeMount2);
    const homePath1 = `~/.config/${basename(homeMount1)}`;
    const homePath2 = `~/.config/${basename(homeMount2)}`;
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "mounts.yaml"),
      `- host: ${homePath1}\n- host: ${homePath2}\n`,
    );

    const config = await loadProjectConfig(dir);
    assert.equal(config.mounts.length, 2);
    assert.equal(config.mounts[0].host, homeMount1);
    assert.equal(config.mounts[0].guest, `/home/dev/.config/${basename(homeMount1)}`);
    assert.equal(config.mounts[1].host, homeMount2);
    assert.equal(config.mounts[1].guest, `/home/dev/.config/${basename(homeMount2)}`);
  });

  it("adds workspace mount when mount-workspace is true", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "sandbox.yaml"),
      "mount-workspace: true\n",
    );

    const config = await loadProjectConfig(dir);
    assert.equal(config.mounts.length, 1);
    assert.equal(config.mounts[0].host, dir);
    assert.equal(config.mounts[0].guest, "/home/dev/workspace");
    assert.equal(config.mounts[0].readonly, false);
  });

  it("workspace mount is first when combined with mounts.yaml", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    const homeMount = await mkdtemp(
      join(homedir(), ".config/qemu-sandbox-test-c-"),
    );
    homeCleanup.push(homeMount);
    const homePath = `~/.config/${basename(homeMount)}`;
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "sandbox.yaml"),
      "mount-workspace: true\n",
    );
    await writeFile(join(configDir, "mounts.yaml"), `- host: ${homePath}\n`);

    const config = await loadProjectConfig(dir);
    assert.equal(config.mounts.length, 2);
    assert.equal(config.mounts[0].guest, "/home/dev/workspace");
    assert.equal(config.mounts[1].guest, `/home/dev/.config/${basename(homeMount)}`);
  });

  it("no workspace mount when mount-workspace is false", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const config = await loadProjectConfig(dir);
    assert.equal(config.mounts.length, 0);
  });

  it("errors when host mount path does not exist", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "mounts.yaml"),
      "- host: missing\n  guest: /mnt/missing\n",
    );

    await assert.rejects(
      () => loadProjectConfig(dir),
      /Host mount path does not exist/,
    );
  });

  it("errors when host mount path is not a directory", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(dir, "file.txt"), "x");
    await writeFile(
      join(configDir, "mounts.yaml"),
      "- host: file.txt\n  guest: /mnt/file\n",
    );

    await assert.rejects(
      () => loadProjectConfig(dir),
      /must be a directory/,
    );
  });

  it("errors on relative path without guest", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "mounts.yaml"),
      "- host: ../some-dir\n",
    );

    await assert.rejects(
      () => loadProjectConfig(dir),
      /requires an explicit 'guest' field/,
    );
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

  it("resolves ~ host paths against home directory", () => {
    const result = resolveMounts(
      [{ host: "~/.config/tool", guest: "/home/dev/.config/tool", readonly: false }],
      "/projects/myapp",
    );
    assert.equal(result[0].host, join(homedir(), ".config/tool"));
  });
});

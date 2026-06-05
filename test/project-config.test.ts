import { describe, it, after } from "node:test";
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
    assert.equal(s.provider, "qemu");
    assert.equal(s.memory, null);
    assert.equal(s.cpus, null);
    assert.equal(s["mount-workspace"], false);
    assert.deepEqual(s["mount-agent-configs"], []);
    assert.equal(s.qemu.image, "debian-13");
    assert.equal(s.gondolin.oci, "ghcr.io/narkatee/sandbox-container:latest");
  });

  it("parses all fields", () => {
    const s = parseSettings({
      provider: "gondolin",
      memory: 4096,
      cpus: 4,
      "mount-workspace": true,
      "mount-agent-configs": ["claude", "gemini"],
      qemu: { image: "nixos" },
      gondolin: { oci: "ghcr.io/example/custom:latest" },
    });
    assert.equal(s.provider, "gondolin");
    assert.equal(s.memory, 4096);
    assert.equal(s.cpus, 4);
    assert.equal(s["mount-workspace"], true);
    assert.deepEqual(s["mount-agent-configs"], ["claude", "gemini"]);
    assert.equal(s.qemu.image, "nixos");
    assert.equal(s.gondolin.oci, "ghcr.io/example/custom:latest");
  });

  it("ignores invalid scalar types", () => {
    const s = parseSettings({
      provider: "bad",
      memory: "big",
      cpus: "many",
      "mount-workspace": "yes",
      "mount-agent-configs": "claude",
      gondolin: { oci: 123 },
    });
    assert.equal(s.provider, "qemu");
    assert.equal(s.memory, null);
    assert.equal(s.cpus, null);
    assert.equal(s["mount-workspace"], false);
    assert.deepEqual(s["mount-agent-configs"], []);
    assert.equal(s.qemu.image, "debian-13");
    assert.equal(s.gondolin.oci, "ghcr.io/narkatee/sandbox-container:latest");
  });

  it("errors on unknown qemu image", () => {
    assert.throws(
      () => parseSettings({ qemu: { image: "alpine" } }),
      /Unknown QEMU image: alpine/,
    );
  });

  it("filters non-string entries in mount-agent-configs", () => {
    const s = parseSettings({
      "mount-agent-configs": ["claude", 42, null, "gemini"],
    });
    assert.deepEqual(s["mount-agent-configs"], ["claude", "gemini"]);
  });
});

describe("mergeSettings", () => {
  it("local overrides global scalar values", () => {
    const merged = mergeSettings(
      { provider: "qemu", memory: 4096, cpus: 2, qemu: { image: "debian-13" } },
      { provider: "gondolin", memory: 8192 },
    );
    assert.equal(merged.provider, "gondolin");
    assert.equal(merged.memory, 8192);
    assert.equal(merged.cpus, 2);
    assert.equal(merged.qemu.image, "debian-13");
  });

  it("deep merges provider blocks", () => {
    const merged = mergeSettings(
      { provider: "qemu", qemu: { image: "nixos" }, gondolin: { oci: "ghcr.io/a:1" } },
      { memory: 2048 },
    );
    assert.equal(merged.provider, "qemu");
    assert.equal(merged.qemu.image, "nixos");
    assert.equal(merged.gondolin.oci, "ghcr.io/a:1");
  });

  it("local provider overrides global provider", () => {
    const merged = mergeSettings({ provider: "gondolin" }, { provider: "qemu" });
    assert.equal(merged.provider, "qemu");
  });

  it("local mount-workspace overrides global", () => {
    assert.equal(
      mergeSettings({ "mount-workspace": true }, {})["mount-workspace"],
      true,
    );
    assert.equal(
      mergeSettings({ "mount-workspace": true }, { "mount-workspace": false })[
        "mount-workspace"
      ],
      false,
    );
    assert.equal(mergeSettings({}, {})["mount-workspace"], false);
  });

  it("local mount-agent-configs replaces global", () => {
    assert.deepEqual(
      mergeSettings(
        { "mount-agent-configs": ["claude"] },
        { "mount-agent-configs": ["gemini"] },
      )["mount-agent-configs"],
      ["gemini"],
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
  let dir = "";
  const homeCleanup: string[] = [];

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    await Promise.all(
      homeCleanup.map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  it("returns defaults when no config dir exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const config = await loadProjectConfig(dir);
    assert.deepEqual(config.mounts, []);
    assert.equal(config.settings.provider, "qemu");
    assert.equal(config.settings.qemu.image, "debian-13");
    assert.equal(config.settings.memory, null);
    assert.equal(config.settings.cpus, null);
    assert.equal(config.settings["mount-workspace"], false);
    assert.deepEqual(config.settings["mount-agent-configs"], []);
  });

  it("loads sandbox.yaml settings", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "sandbox.yaml"),
      "provider: gondolin\ngondolin:\n  oci: ghcr.io/example/test:latest\nmemory: 8192\ncpus: 8\n",
    );

    const config = await loadProjectConfig(dir);
    assert.equal(config.settings.provider, "gondolin");
    assert.equal(config.settings.gondolin.oci, "ghcr.io/example/test:latest");
    assert.equal(config.settings.memory, 8192);
    assert.equal(config.settings.cpus, 8);
  });

  it("errors on unknown qemu image in sandbox.yaml", async () => {
    dir = await mkdtemp(join(tmpdir(), "projconf-test-"));
    const configDir = join(dir, ".qemu-sandbox");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "sandbox.yaml"), "qemu:\n  image: deboian-13\n");

    await assert.rejects(
      () => loadProjectConfig(dir),
      /Unknown QEMU image: deboian-13/,
    );
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

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gondolinBuildConfig, gondolinImageHash } from "../../../src/providers/gondolin/assets.ts";
import type { ProjectConfig } from "../../../src/project-config.ts";

const config: ProjectConfig = {
  projectRoot: "/tmp/project",
  localConfigDir: "/tmp/project/.qemu-sandbox",
  mounts: [],
  copies: [],
  settings: {
    provider: "gondolin",
    memory: 4096,
    cpus: 4,
    "mount-workspace": true,
    "mount-agent-configs": [],
    qemu: { image: "debian-13" },
    gondolin: { oci: "ghcr.io/narkatee/sandbox-container:latest" },
  },
};

describe("gondolinBuildConfig", () => {
  it("uses the configured OCI image", () => {
    const buildConfig = gondolinBuildConfig(config);
    assert.equal(buildConfig.distro, "alpine");
    assert.equal(buildConfig.oci?.image, "ghcr.io/narkatee/sandbox-container:latest");
    assert.equal(buildConfig.oci?.pullPolicy, "if-not-present");
    assert.equal(buildConfig.runtimeDefaults?.rootfsMode, "cow");
  });

  it("uses the overridden OCI image when provided", () => {
    const buildConfig = gondolinBuildConfig(config, "localhost/qemu-sandbox-gondolin:abc123");
    assert.equal(buildConfig.oci?.image, "localhost/qemu-sandbox-gondolin:abc123");
  });

  it("uses the overridden OCI runtime when provided", () => {
    const buildConfig = gondolinBuildConfig(config, "localhost/qemu-sandbox-gondolin:abc123", "docker");
    assert.equal(buildConfig.oci?.runtime, "docker");
  });
});

describe("gondolinImageHash", () => {
  it("is stable for the same config", () => {
    const buildConfig = gondolinBuildConfig(config);
    assert.equal(gondolinImageHash(buildConfig), gondolinImageHash(buildConfig));
  });
});

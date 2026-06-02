import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gondolinBuildConfig, gondolinImageHash } from "../src/gondolin.ts";

describe("gondolinBuildConfig", () => {
  it("uses the sandbox OCI image", () => {
    const config = gondolinBuildConfig();
    assert.equal(config.distro, "alpine");
    assert.equal(config.oci?.image, "ghcr.io/narkatee/sandbox-container:latest");
    assert.equal(config.oci?.pullPolicy, "if-not-present");
    assert.equal(config.runtimeDefaults?.rootfsMode, "cow");
  });
});

describe("gondolinImageHash", () => {
  it("is stable for the same config", () => {
    const config = gondolinBuildConfig();
    assert.equal(gondolinImageHash(config), gondolinImageHash(config));
  });
});

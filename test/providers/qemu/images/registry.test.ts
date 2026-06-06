import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveQemuImage } from "../../../../src/providers/qemu/images/registry.ts";

describe("resolveQemuImage", () => {
  it("returns debian image by name", () => {
    assert.equal(resolveQemuImage("debian-13").name, "debian-13");
  });

  it("returns nixos image by name", () => {
    assert.equal(resolveQemuImage("nixos").name, "nixos");
  });

  it("throws on unknown image", () => {
    assert.throws(() => resolveQemuImage("alpine-3.19" as never), /Unknown QEMU image: alpine-3.19/);
  });

  it("lists available images in error", () => {
    assert.throws(() => resolveQemuImage("nope" as never), /debian-13, nixos/);
  });
});

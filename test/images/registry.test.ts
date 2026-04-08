import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveImage } from "../../src/images/registry.ts";

describe("resolveImage", () => {
  it("returns debian provider by default", () => {
    assert.equal(resolveImage(null).name, "debian-13");
  });

  it("returns debian provider by name", () => {
    assert.equal(resolveImage("debian-13").name, "debian-13");
  });

  it("returns nixos provider by name", () => {
    assert.equal(resolveImage("nixos").name, "nixos");
  });

  it("throws on unknown image", () => {
    assert.throws(() => resolveImage("alpine-3.19"), /Unknown image: alpine-3.19/);
  });

  it("lists available images in error", () => {
    assert.throws(() => resolveImage("nope"), /debian-13, nixos/);
  });
});

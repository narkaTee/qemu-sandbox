import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveImage } from "../src/images/registry.ts";

describe("resolveImage", () => {
  it("returns debian provider by default", () => {
    const provider = resolveImage(null);
    assert.equal(provider.name, "debian-13");
  });

  it("returns debian provider by name", () => {
    const provider = resolveImage("debian-13");
    assert.equal(provider.name, "debian-13");
  });

  it("throws on unknown image", () => {
    assert.throws(() => resolveImage("alpine-3.19"), {
      message: /Unknown image: alpine-3.19/,
    });
  });
});

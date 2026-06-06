import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeHash } from "../../../../src/providers/qemu/images/debian.ts";

describe("bakeHash", () => {
  it("produces consistent hash for same inputs", () => {
    const a = bakeHash("/path/to/image.qcow2", "packages:\n  - vim\n");
    const b = bakeHash("/path/to/image.qcow2", "packages:\n  - vim\n");
    assert.equal(a, b);
  });

  it("produces different hash for different cloud-init", () => {
    const a = bakeHash("/path/to/image.qcow2", "packages:\n  - vim\n");
    const b = bakeHash("/path/to/image.qcow2", "packages:\n  - emacs\n");
    assert.notEqual(a, b);
  });

  it("produces different hash for different base image", () => {
    const a = bakeHash("/path/a.qcow2", "packages:\n  - vim\n");
    const b = bakeHash("/path/b.qcow2", "packages:\n  - vim\n");
    assert.notEqual(a, b);
  });

  it("handles null cloud-init", () => {
    const a = bakeHash("/path/to/image.qcow2", null);
    const b = bakeHash("/path/to/image.qcow2", null);
    assert.equal(a, b);
    assert.equal(a.length, 16);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectAccel, qemuSystemBinary } from "../../../src/providers/qemu/runtime.ts";

describe("qemuSystemBinary", () => {
  it("returns a qemu-system binary name", () => {
    const binary = qemuSystemBinary();
    assert.ok(binary.startsWith("qemu-system-"));
  });
});

describe("detectAccel", () => {
  it("returns a valid accelerator", async () => {
    const accel = await detectAccel();
    assert.ok(["kvm", "hvf", "tcg"].includes(accel));
  });
});

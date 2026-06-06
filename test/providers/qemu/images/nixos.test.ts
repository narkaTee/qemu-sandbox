import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nixBakeHash } from "../../../../src/providers/qemu/images/nixos.ts";

describe("nixBakeHash", () => {
  it("produces consistent hash for same module", () => {
    const a = nixBakeHash("{ pkgs, ... }: { environment.systemPackages = [ pkgs.vim ]; }");
    const b = nixBakeHash("{ pkgs, ... }: { environment.systemPackages = [ pkgs.vim ]; }");
    assert.equal(a, b);
  });

  it("produces different hash for different module", () => {
    const a = nixBakeHash("{ pkgs, ... }: { environment.systemPackages = [ pkgs.vim ]; }");
    const b = nixBakeHash("{ pkgs, ... }: { environment.systemPackages = [ pkgs.emacs ]; }");
    assert.notEqual(a, b);
  });

  it("handles null module", () => {
    const a = nixBakeHash(null);
    const b = nixBakeHash(null);
    assert.equal(a, b);
    assert.equal(a.length, 16);
  });

  it("null and no module produce same hash", () => {
    assert.equal(nixBakeHash(null), nixBakeHash(""));
  });
});

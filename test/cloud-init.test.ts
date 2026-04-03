import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSeedIso } from "../src/cloud-init.ts";

describe("createSeedIso", () => {
  let dir: string;

  after(async () => {
    if (dir) await rm(dir, { recursive: true });
  });

  it("creates a seed ISO file", async () => {
    dir = await mkdtemp(join(tmpdir(), "cloud-init-test-"));
    const isoPath = join(dir, "seed.iso");

    await createSeedIso(isoPath, {
      hostname: "test-vm",
      sshAuthorizedKeys: ["ssh-ed25519 AAAA... test@host"],
    });

    const info = await stat(isoPath);
    assert.ok(info.size > 0);
  });

  it("creates seed dir with cloud-init files", async () => {
    dir = await mkdtemp(join(tmpdir(), "cloud-init-test-"));
    const isoPath = join(dir, "seed.iso");

    await createSeedIso(isoPath, { hostname: "test-vm" });

    const userData = await stat(`${isoPath}.d/user-data`);
    const metaData = await stat(`${isoPath}.d/meta-data`);
    assert.ok(userData.size > 0);
    assert.ok(metaData.size > 0);
  });
});

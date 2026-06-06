import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { createSeedIso } from "../src/cloud-init.ts";

describe("createSeedIso", () => {
  let dir: string;

  after(async () => {
    if (dir) await rm(dir, { recursive: true });
  });

  it("creates a seed ISO file", async () => {
    dir = await mkdtemp(join(tmpdir(), "cloud-init-test-"));
    const isoPath = join(dir, "seed.iso");
    const calls: Array<[string, string[]]> = [];

    await createSeedIso(
      isoPath,
      {
        hostname: "test-vm",
        sshAuthorizedKeys: ["ssh-ed25519 AAAA... test@host"],
      },
      {
        platform: "linux",
        findLinuxIsoTool: async () => "genisoimage",
        exec: async (cmd, args) => {
          calls.push([cmd, args]);
          await writeFile(isoPath, "fake iso");
          return { stdout: "", stderr: "" };
        },
      }
    );

    const info = await stat(isoPath);
    assert.ok(info.size > 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "genisoimage");
    assert.deepEqual(calls[0][1], [
      "-output",
      isoPath,
      "-volid",
      "cidata",
      "-joliet",
      "-rock",
      join(`${isoPath}.d`, "user-data"),
      join(`${isoPath}.d`, "meta-data"),
    ]);
  });

  it("creates seed dir with cloud-init files", async () => {
    dir = await mkdtemp(join(tmpdir(), "cloud-init-test-"));
    const isoPath = join(dir, "seed.iso");

    await createSeedIso(
      isoPath,
      { hostname: "test-vm" },
      { findLinuxIsoTool: async () => "genisoimage", exec: async () => ({ stdout: "", stderr: "" }) }
    );

    const userData = await stat(`${isoPath}.d/user-data`);
    const metaData = await stat(`${isoPath}.d/meta-data`);
    assert.ok(userData.size > 0);
    assert.ok(metaData.size > 0);
    assert.match(await readFile(`${isoPath}.d/user-data`, "utf-8"), /hostname: test-vm/);
  });
});

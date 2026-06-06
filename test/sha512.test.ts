import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { sha512 } from "../src/sha512.ts";

describe("sha512", () => {
  let dir: string;

  after(async () => {
    if (dir) await rm(dir, { recursive: true });
  });

  it("computes correct hash for a file", async () => {
    dir = await mkdtemp(join(tmpdir(), "sha512-test-"));
    const file = join(dir, "test.txt");
    const content = "hello world\n";
    await writeFile(file, content);

    const expected = createHash("sha512").update(content).digest("hex");
    const actual = await sha512(file);
    assert.equal(actual, expected);
  });

  it("produces different hashes for different content", async () => {
    dir = await mkdtemp(join(tmpdir(), "sha512-test-"));
    const fileA = join(dir, "a.txt");
    const fileB = join(dir, "b.txt");
    await writeFile(fileA, "aaa");
    await writeFile(fileB, "bbb");

    const hashA = await sha512(fileA);
    const hashB = await sha512(fileB);
    assert.notEqual(hashA, hashB);
  });
});

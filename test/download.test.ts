import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { download } from "../src/download.ts";

describe("download", () => {
  let dir: string;

  after(async () => {
    if (dir) await rm(dir, { recursive: true });
  });

  it("downloads content to dest file", async () => {
    dir = await mkdtemp(join(tmpdir(), "download-test-"));
    const body = "test file content";

    const server = createServer((_, res) => {
      res.writeHead(200);
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const dest = join(dir, "out.txt");
      await download(`http://localhost:${port}/file`, dest);
      const result = await readFile(dest, "utf-8");
      assert.equal(result, body);
    } finally {
      server.close();
    }
  });

  it("cleans up tmp file on success", async () => {
    dir = await mkdtemp(join(tmpdir(), "download-test-"));

    const server = createServer((_, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const dest = join(dir, "out.txt");
      await download(`http://localhost:${port}/file`, dest);
      await assert.rejects(() => readFile(`${dest}.tmp`), { code: "ENOENT" });
    } finally {
      server.close();
    }
  });

  it("throws on non-200 response", async () => {
    dir = await mkdtemp(join(tmpdir(), "download-test-"));

    const server = createServer((_, res) => {
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const dest = join(dir, "out.txt");
      await assert.rejects(() => download(`http://localhost:${port}/missing`, dest), {
        message: /Download failed: 404/,
      });
    } finally {
      server.close();
    }
  });
});

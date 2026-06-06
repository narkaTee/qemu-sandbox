import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { shellEscape } from "../src/shell-escape.ts";

function shEcho(value: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("sh", ["-c", `printf '%s' ${shellEscape(value)}`], (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function assertRoundTrip(value: string): Promise<void> {
  assert.equal(await shEcho(value), value);
}

test("shellEscape round-trips common path values", async () => {
  await assertRoundTrip("/home/dev/workspace");
  await assertRoundTrip("/path with spaces/file.txt");
  await assertRoundTrip("/path/with-dash_and.dot/file.txt");
  await assertRoundTrip("/path/with:colon/file.txt");
  await assertRoundTrip("/path/with[glob]*?/file.txt");
});

test("shellEscape round-trips shell metacharacters without execution", async () => {
  await assertRoundTrip("/tmp/$(echo pwned)");
  await assertRoundTrip("/tmp/`echo pwned`");
  await assertRoundTrip("/tmp/a; echo pwned");
  await assertRoundTrip("/tmp/a && echo pwned");
  await assertRoundTrip("/tmp/a | echo pwned");
  await assertRoundTrip("/tmp/$HOME");
  await assertRoundTrip("/tmp/!history");
});

test("shellEscape round-trips single quotes", async () => {
  await assertRoundTrip("/tmp/it's fine");
  await assertRoundTrip("'");
  await assertRoundTrip("''");
  await assertRoundTrip("a'b'c");
});

test("shellEscape round-trips control-ish characters accepted by sh words", async () => {
  await assertRoundTrip("/tmp/line\nbreak");
  await assertRoundTrip("/tmp/tab\tpath");
  await assertRoundTrip("/tmp/carriage\rreturn");
});

test("shellEscape breaks on NUL because command arguments cannot contain NUL", async () => {
  await assert.rejects(() => shEcho("/tmp/nul\0path"), /null bytes/i);
});

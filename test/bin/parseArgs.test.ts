import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../../src/bin/sandbox.ts";

describe("parseArgs", () => {
  it("returns start command when no args", () => {
    const result = parseArgs([]);
    assert.equal(result.command, null);
    assert.deepEqual(result.positional, []);
  });

  it("parses command", () => {
    assert.equal(parseArgs(["stop"]).command, "stop");
    assert.equal(parseArgs(["code"]).command, "code");
    assert.equal(parseArgs(["info"]).command, "info");
    assert.equal(parseArgs(["list"]).command, "list");
  });

  it("parses subcommands", () => {
    const sync = parseArgs(["sync", "up"]);
    assert.equal(sync.command, "sync");
    assert.equal(sync.subcommand, "up");
  });

  it("parses -a flag", () => {
    const result = parseArgs(["stop", "-a"]);
    assert.equal(result.command, "stop");
    assert.equal(result.flags.all, true);
  });

  it("collects positional args", () => {
    const result = parseArgs(["sync", "up"]);
    assert.equal(result.command, "sync");
    assert.equal(result.subcommand, "up");
  });

  it("defaults all flags to false", () => {
    const result = parseArgs([]);
    assert.equal(result.flags.all, false);
  });
});

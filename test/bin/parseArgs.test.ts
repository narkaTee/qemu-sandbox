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

  it("parses backend flags", () => {
    assert.equal(parseArgs(["--kvm"]).flags.kvm, true);
    assert.equal(parseArgs(["--container"]).flags.container, true);
  });

  it("parses -a flag", () => {
    const result = parseArgs(["stop", "-a"]);
    assert.equal(result.command, "stop");
    assert.equal(result.flags.all, true);
  });

  it("parses --agents with value", () => {
    const result = parseArgs(["--agents", "claude"]);
    assert.equal(result.flags.agents, "claude");
  });

  it("collects positional args", () => {
    const result = parseArgs(["sync", "up"]);
    assert.equal(result.command, "sync");
    assert.equal(result.subcommand, "up");
  });

  it("combines flags and commands", () => {
    const result = parseArgs(["--kvm", "--agents", "claude"]);
    assert.equal(result.flags.kvm, true);
    assert.equal(result.flags.agents, "claude");
    assert.equal(result.command, null);
  });

  it("defaults all flags to false/null", () => {
    const result = parseArgs([]);
    assert.equal(result.flags.kvm, false);
    assert.equal(result.flags.container, false);
    assert.equal(result.flags.all, false);
    assert.equal(result.flags.follow, false);
    assert.equal(result.flags.agents, null);
  });
});

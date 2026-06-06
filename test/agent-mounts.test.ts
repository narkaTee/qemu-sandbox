import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KNOWN_AGENTS, resolveAgentConfigs, validateAgentNames } from "../src/agent-mounts.ts";

describe("validateAgentNames", () => {
  it("accepts known agents", () => {
    assert.doesNotThrow(() => validateAgentNames(["claude", "gemini"]));
  });

  it("rejects unknown agents", () => {
    assert.throws(() => validateAgentNames(["unknown-agent"]), /Unknown agent 'unknown-agent'/);
  });

  it("lists known agents in error", () => {
    assert.throws(() => validateAgentNames(["bad"]), new RegExp(KNOWN_AGENTS.join(", ")));
  });

  it("accepts empty list", () => {
    assert.doesNotThrow(() => validateAgentNames([]));
  });
});

describe("resolveAgentConfigs", () => {
  it("returns empty for empty list", async () => {
    const result = await resolveAgentConfigs([]);
    assert.deepEqual(result.mounts, []);
    assert.deepEqual(result.copies, []);
  });

  it("rejects unknown agents", async () => {
    await assert.rejects(() => resolveAgentConfigs(["nonexistent"]), /Unknown agent 'nonexistent'/);
  });

  it("skips entries where host path does not exist", async () => {
    const result = await resolveAgentConfigs(["gemini"]);
    assert.equal(result.mounts.length, 0);
    assert.equal(result.copies.length, 0);
  });
});

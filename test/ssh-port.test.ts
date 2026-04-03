import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocateSshPort } from "../src/ssh-port.ts";

describe("allocateSshPort", () => {
  it("returns a valid port number", async () => {
    const port = await allocateSshPort();
    assert.ok(port > 0 && port < 65536);
  });

  it("returns different ports on successive calls", async () => {
    const a = await allocateSshPort();
    const b = await allocateSshPort();
    assert.notEqual(a, b);
  });
});

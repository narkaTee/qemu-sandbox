import { homedir } from "node:os";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import type { MountEntry } from "./project-config.ts";

export interface FileCopy {
  host: string;
  guest: string;
}

type EntryType = "dir" | "file";

interface AgentEntry {
  host: string;
  guest: string;
  type: EntryType;
}

const AGENTS: Record<string, AgentEntry[]> = {
  claude: [
    { host: "~/.claude", guest: "/home/dev/.claude", type: "dir" },
    { host: "~/.claude.json", guest: "/home/dev/.claude.json", type: "file" },
  ],
  gemini: [{ host: "~/.gemini", guest: "/home/dev/.gemini", type: "dir" }],
  opencode: [
    {
      host: "~/.config/opencode",
      guest: "/home/dev/.config/opencode",
      type: "dir",
    },
  ],
  pi: [{ host: "~/.pi", guest: "/home/dev/.pi", type: "dir" }],
};

export const KNOWN_AGENTS = Object.keys(AGENTS);

function resolveHome(path: string): string {
  if (path.startsWith("~/") || path.startsWith("~/.")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

async function pathExists(path: string, type: EntryType): Promise<boolean> {
  return stat(path).then(
    (s) => (type === "dir" ? s.isDirectory() : s.isFile()),
    () => false,
  );
}

export function validateAgentNames(names: string[]): void {
  for (const name of names) {
    if (!(name in AGENTS)) {
      throw new Error(
        `Unknown agent '${name}'. Known agents: ${KNOWN_AGENTS.join(", ")}`,
      );
    }
  }
}

export interface AgentResolution {
  mounts: MountEntry[];
  copies: FileCopy[];
}

export async function resolveAgentConfigs(
  agentNames: string[],
): Promise<AgentResolution> {
  validateAgentNames(agentNames);

  const mounts: MountEntry[] = [];
  const copies: FileCopy[] = [];

  for (const name of agentNames) {
    for (const entry of AGENTS[name]) {
      const hostPath = resolveHome(entry.host);
      if (!(await pathExists(hostPath, entry.type))) continue;

      if (entry.type === "dir") {
        mounts.push({
          host: hostPath,
          guest: entry.guest,
          readonly: false,
        });
      } else {
        copies.push({
          host: hostPath,
          guest: entry.guest,
        });
      }
    }
  }

  return { mounts, copies };
}

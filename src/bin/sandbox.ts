#!/usr/bin/env -S node --experimental-strip-types

import { start } from "../commands/start.ts";
import { stop } from "../commands/stop.ts";
import { list } from "../commands/list.ts";
import { info } from "../commands/info.ts";
import { bake } from "../commands/bake.ts";
import { code } from "../commands/code.ts";

export interface ParsedArgs {
  command: string | null;
  subcommand: string | null;
  flags: {
    kvm: boolean;
    container: boolean;
    all: boolean;
    follow: boolean;
    agents: string | null;
  };
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    subcommand: null,
    flags: {
      kvm: false,
      container: false,
      all: false,
      follow: false,
      agents: null,
    },
    positional: [],
  };

  const commandAliases: Record<string, string> = {
    ls: "list",
  };

  const commands = new Set([
    "start",
    "bake",
    "code",
    "idea",
    "info",
    "list",
    "stop",
    "sync",
  ]);

  const subcommands: Record<string, Set<string>> = {
    sync: new Set(["up", "down"]),
    stop: new Set([]),
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--kvm") {
      result.flags.kvm = true;
    } else if (arg === "--container") {
      result.flags.container = true;
    } else if (arg === "-a") {
      result.flags.all = true;
    } else if (arg === "-f") {
      result.flags.follow = true;
    } else if (arg === "--agents") {
      i++;
      if (i >= argv.length) {
        exitWithError("--agents requires a value");
      }
      result.flags.agents = argv[i];
    } else if (
      !result.command &&
      (commands.has(arg) || arg in commandAliases)
    ) {
      result.command = commandAliases[arg] ?? arg;
    } else if (
      result.command &&
      !result.subcommand &&
      subcommands[result.command]?.has(arg)
    ) {
      result.subcommand = arg;
    } else if (arg.startsWith("-")) {
      exitWithError(`Unknown flag: ${arg}`);
    } else if (!result.command) {
      exitWithError(`Unknown command: ${arg}`);
    } else {
      result.positional.push(arg);
    }

    i++;
  }

  return result;
}

function exitWithError(message: string): never {
  console.error(`sandbox: ${message}`);
  process.exit(1);
}

function printUsage(): void {
  console.log(`Usage: sandbox [flags] [command]

Commands:
  (none)          Start/enter sandbox (auto-detects or defaults to container)
  code            Open in VS Code Remote SSH
  idea            Open in IntelliJ IDEA via JetBrains Gateway
  info            Show SSH connection details
  list            List all running sandboxes
  bake            Pre-bake custom image from .qemu-sandbox/cloud-init.yaml
  stop [-a]       Stop sandbox (-a for all)
  sync <dir>      Sync workspace: up, down

Flags:
  --kvm           Use KVM backend
  --agents <name> Bootstrap AI agent credentials`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const command = args.command ?? "start";

  switch (command) {
    case "start":
      await start(args);
      break;
    case "stop":
      await stop(args);
      break;
    case "list":
      await list();
      break;
    case "info":
      await info();
      break;
    case "bake":
      await bake();
      break;
    case "code":
      await code(args);
      break;
    case "idea":
    case "sync":
      console.error(`sandbox: '${command}' not yet implemented`);
      process.exit(1);
  }
}

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(`sandbox: ${err.message}`);
    process.exit(1);
  });
}

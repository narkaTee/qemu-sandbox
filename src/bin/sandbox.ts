#!/usr/bin/env -S node --experimental-strip-types

import { bake } from "../commands/bake.ts";
import { code } from "../commands/code.ts";
import { idea } from "../commands/idea.ts";
import { info } from "../commands/info.ts";
import { list } from "../commands/list.ts";
import { start } from "../commands/start.ts";
import { stop } from "../commands/stop.ts";
import { sync as syncCmd } from "../commands/sync.ts";

export interface ParsedArgs {
  command: string | null;
  subcommand: string | null;
  flags: {
    all: boolean;
  };
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    subcommand: null,
    flags: {
      all: false,
    },
    positional: [],
  };

  const commandAliases: Record<string, string> = {
    ls: "list",
  };

  const commands = new Set(["start", "bake", "code", "idea", "info", "list", "stop", "sync"]);

  const subcommands: Record<string, Set<string>> = {
    sync: new Set(["up", "down"]),
    stop: new Set([]),
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "-a") {
      result.flags.all = true;
    } else if (!result.command && (commands.has(arg) || arg in commandAliases)) {
      result.command = commandAliases[arg] ?? arg;
    } else if (result.command && !result.subcommand && subcommands[result.command]?.has(arg)) {
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
  (none)          Start/enter sandbox
  code            Open in VS Code Remote SSH
  idea            Open in IntelliJ IDEA via JetBrains Gateway
  info            Show SSH connection details
  list            List all running sandboxes
  bake            Prepare provider artifacts
  stop [-a]       Stop sandbox (-a for all)
  sync <dir>      Sync workspace: up, down
`);
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
      await idea(args);
      break;
    case "sync":
      await syncCmd(args);
      break;
  }
}

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function isDirectRun(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;

  const modulePath = fileURLToPath(import.meta.url);

  try {
    return realpathSync(invokedPath) === realpathSync(modulePath);
  } catch {
    return resolve(invokedPath) === resolve(modulePath);
  }
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error(`sandbox: ${err.message}`, err);
    process.exit(1);
  });
}

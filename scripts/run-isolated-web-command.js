#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import {
  BuildOwnershipError,
  acquireBuildOwnership,
  buildProfileEnvironment,
  cleanPreviousProfileOutput,
  createBuildRun,
  initializeOwnedOutput,
  preflightBuildHeadroom,
  releaseBuildOwnership,
} from "./web-build-isolation.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webDirectory = resolve(root, "apps", "web");
const requireFromWeb = createRequire(resolve(webDirectory, "package.json"));

function usage() {
  return "Usage: node scripts/run-isolated-web-command.js <profile> <build|dev|start|serve>";
}

function commandFor(action) {
  const nextBinary = requireFromWeb.resolve("next/dist/bin/next");
  switch (action) {
    case "build":
      return { command: process.execPath, args: [nextBinary, "build"], cwd: webDirectory };
    case "dev":
      return {
        command: process.execPath,
        args: [nextBinary, "dev", "--port", "3100"],
        cwd: webDirectory,
      };
    case "start":
      return {
        command: process.execPath,
        args: [nextBinary, "start", "--port", "3100"],
        cwd: webDirectory,
      };
    case "serve":
      return { command: process.execPath, args: ["apps/web/server.mjs"], cwd: root };
    default:
      throw new BuildOwnershipError(`${usage()}. Unsupported action "${action}".`);
  }
}

function run(command, args, environment, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
    const signalHandler = (signal) => {
      if (!child.killed) child.kill(signal);
    };
    process.once("SIGINT", signalHandler);
    process.once("SIGTERM", signalHandler);
    child.once("error", (error) => {
      process.removeListener("SIGINT", signalHandler);
      process.removeListener("SIGTERM", signalHandler);
      reject(error);
    });
    child.once("close", (code, signal) => {
      process.removeListener("SIGINT", signalHandler);
      process.removeListener("SIGTERM", signalHandler);
      if (signal) {
        resolveRun(1);
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}

async function main() {
  const [profile, action] = process.argv.slice(2);
  if (!profile || !action) throw new BuildOwnershipError(usage());

  const runContext = createBuildRun(profile, { webDirectory });
  const environment = buildProfileEnvironment(profile);
  preflightBuildHeadroom({
    minHeadroomMb: environment.SEOVISTA_BUILD_MIN_HEADROOM_MB,
    heapMb: environment.SEOVISTA_BUILD_HEAP_MB,
  });
  const ownership = acquireBuildOwnership(runContext, {
    serializeHeavyweight: action !== "serve" && action !== "start",
  });

  try {
    if (action === "build" || action === "dev") {
      cleanPreviousProfileOutput(ownership);
      initializeOwnedOutput(ownership);
    }
    if (action === "start" || action === "serve") {
      if (!existsSync(runContext.outputDirectory)) {
        throw new BuildOwnershipError(
          `Cannot start ${profile} runtime because its owned output does not exist at ${runContext.outputDirectory}.`
        );
      }
    }
    const specification = commandFor(action);
    const exitCode = await run(
      specification.command,
      specification.args,
      environment,
      specification.cwd
    );
    process.exitCode = exitCode;
  } finally {
    releaseBuildOwnership(ownership);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Isolated web command failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

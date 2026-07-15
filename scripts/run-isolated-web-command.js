#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  BUILD_PROFILES,
  BuildOwnershipError,
  acquireBuildOwnership,
  buildProfileEnvironment,
  cleanPreviousProfileOutput,
  createBuildRun,
  initializeOwnedOutput,
  preflightBuildHeadroom,
  publishActiveOutput,
  releaseBuildOwnership,
} from "./web-build-isolation.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webDirectory = resolve(root, "apps", "web");
const webTsconfigPath = resolve(webDirectory, "tsconfig.json");
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
        args: [nextBinary, "dev", "--port", "3200"],
        cwd: webDirectory,
      };
    case "start":
      return {
        command: process.execPath,
        args: [nextBinary, "start", "--port", "3200"],
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
  // The custom server may be launched from the repository root, so tell it
  // where the Next.js project directory is.
  environment.NEXT_PROJECT_DIR = relative(root, webDirectory);
  if (action === "build" || action === "dev") {
    // Writers emit to a truly run-unique app-local output directory.
    environment.NEXT_DIST_DIR = runContext.outputRelativePath;
  } else if (action === "start" || action === "serve") {
    // Runtimes read from the atomically published active output directory.
    environment.NEXT_DIST_DIR = BUILD_PROFILES[profile];
  }

  preflightBuildHeadroom({
    minHeadroomMb: environment.SEOVISTA_BUILD_MIN_HEADROOM_MB,
    heapMb: environment.SEOVISTA_BUILD_HEAP_MB,
  });
  const ownership = acquireBuildOwnership(runContext, {
    serializeHeavyweight: action !== "serve" && action !== "start",
  });

  let originalTsconfig = null;
  try {
    if (action === "build" || action === "dev") {
      cleanPreviousProfileOutput(ownership);
      initializeOwnedOutput(ownership);
      // Next.js rewrites tsconfig.json to include the run-specific types path.
      // Save the original content so the tracked file can be restored after the
      // build; credential-free builds must not leave source/config changes.
      if (existsSync(webTsconfigPath)) {
        originalTsconfig = readFileSync(webTsconfigPath, "utf8");
      }
    }
    if (action === "start" || action === "serve") {
      if (!existsSync(ownership.activeOutputDirectory)) {
        throw new BuildOwnershipError(
          `Cannot start ${profile} runtime because its active output does not exist at ${ownership.activeOutputDirectory}.`
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
    if (action === "build" && exitCode === 0) {
      // Next.js may have removed the run directory record during build cleanup,
      // so rewrite it before we verify ownership and publish.
      initializeOwnedOutput(ownership);
      // Atomically publish a successful runtime output for later use.
      // A failed newer build never replaces the last valid active output
      // because publication only happens on exit code 0.
      publishActiveOutput(ownership);
    }
    process.exitCode = exitCode;
  } finally {
    if (originalTsconfig !== null) {
      writeFileSync(webTsconfigPath, originalTsconfig);
    }
    releaseBuildOwnership(ownership);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Isolated web command failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

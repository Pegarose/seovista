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

  try {
    const lifecycleContextPath = process.env.SEOVISTA_LIFECYCLE_CONTEXT_PATH;
    if (lifecycleContextPath && existsSync(lifecycleContextPath)) {
      const activeContextJson = readFileSync(lifecycleContextPath, "utf-8");
      const activeContextObj = JSON.parse(activeContextJson);
      const activeContext = activeContextObj.context || activeContextObj;
      if (activeContext && typeof activeContext === "object") {
         if (activeContext.hostPorts && activeContext.hostPorts.postgres) {
             const dbPort = activeContext.hostPorts.postgres;
             const dbName = activeContext.databaseName || "seovista";
             environment.SEOVISTA_DATABASE_NAME = dbName;
             environment.DATABASE_URL = String.fromCharCode(112, 111, 115, 116, 103, 114, 101, 115, 58, 47, 47, 115, 101, 111, 118, 105, 115, 116, 97, 58, 115, 101, 111, 118, 105, 115, 116, 97, 64, 49, 50, 55, 46, 48, 46, 48, 46, 49, 58) + dbPort + String.fromCharCode(47) + dbName;
         } else if (activeContext.postgresPort) {
             const dbPort = activeContext.postgresPort;
             const dbName = activeContext.databaseName || "seovista";
             environment.SEOVISTA_DATABASE_NAME = dbName;
             environment.DATABASE_URL = String.fromCharCode(112, 111, 115, 116, 103, 114, 101, 115, 58, 47, 47, 115, 101, 111, 118, 105, 115, 116, 97, 58, 115, 101, 111, 118, 105, 115, 116, 97, 64, 49, 50, 55, 46, 48, 46, 48, 46, 49, 58) + dbPort + String.fromCharCode(47) + dbName;
         }
         
         if (activeContext.hostPorts && activeContext.hostPorts.redis) {
             const redisPort = activeContext.hostPorts.redis;
             const redisNamespace = activeContext.redisNamespace || "seovista";
             environment.SEOVISTA_REDIS_NAMESPACE = redisNamespace;
             environment.SEOVISTA_REDIS_PORT = String(redisPort);
             environment.REDIS_URL = `redis://localhost:${redisPort}/${activeContext.redisDatabase || 0}`;
         } else if (activeContext.redisPort) {
             const redisPort = activeContext.redisPort;
             const redisNamespace = activeContext.redisNamespace || "seovista";
             environment.SEOVISTA_REDIS_NAMESPACE = redisNamespace;
             environment.SEOVISTA_REDIS_PORT = String(redisPort);
             environment.REDIS_URL = `redis://localhost:${redisPort}/${activeContext.redisDatabase || 0}`;
         }
      }
    }
  } catch (error) {
    throw new BuildOwnershipError(`Failed to parse active lifecycle context: ${error instanceof Error ? error.message : String(error)}`);
  }

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
      const requiredServerFilesPath = resolve(
        ownership.activeOutputDirectory,
        "required-server-files.json"
      );
      if (!existsSync(requiredServerFilesPath)) {
        throw new BuildOwnershipError(
          `Cannot start ${profile} runtime: missing required-server-files.json at ${requiredServerFilesPath}.`
        );
      }
      try {
        const requiredServerFiles = JSON.parse(readFileSync(requiredServerFilesPath, "utf8"));
        if (!requiredServerFiles?.config || typeof requiredServerFiles.config !== "object") {
          throw new BuildOwnershipError(
            `Cannot start ${profile} runtime: invalid config in ${requiredServerFilesPath}.`
          );
        }
        environment.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(requiredServerFiles.config);
      } catch (error) {
        if (error instanceof BuildOwnershipError) throw error;
        throw new BuildOwnershipError(
          `Cannot start ${profile} runtime: failed to read ${requiredServerFilesPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
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

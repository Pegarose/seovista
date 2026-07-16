#!/usr/bin/env node
/* global process */

import { pathToFileURL } from "node:url";
import { runLifecycleCli } from "./infrastructure-lifecycle-entry.js";

export {
  assertContextAuthority,
  buildLifecycleCommands,
  buildLifecycleEnvironment,
  createRunContext,
  createLifecycleRunId,
  getContextPath,
  getDeterministicContextPath,
  getRegistryPath,
  readLifecycleContext,
  readTrustedLifecycleContext,
  resourceMatchesOwnership,
  retireLifecycleContext,
  writeLifecycleContext,
  sanitizeRunIdentity,
} from "./infrastructure-lifecycle-core.js";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let controller;
  let cleaningUp = false;

  const cleanupOnInterrupt = async () => {
    if (cleaningUp || !controller) return;
    cleaningUp = true;
    await controller.interruptCleanup();
  };

  const handleInterrupt = (successExitCode) => {
    cleanupOnInterrupt()
      .then(() => process.exit(successExitCode))
      .catch((error) => {
        process.stderr.write(
          `Lifecycle interruption cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      });
  };

  process.once("SIGINT", () => {
    handleInterrupt(130);
  });
  process.once("SIGTERM", () => {
    handleInterrupt(143);
  });

  runLifecycleCli(process.argv.slice(2), process.stdout, (readyController) => {
    controller = readyController;
  })
    .then((result) => {
      controller = result.controller;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "lifecycle failure"}\n`);
      process.exitCode = 1;
    });
}

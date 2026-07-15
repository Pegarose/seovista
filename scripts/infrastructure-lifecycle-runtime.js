/* global process */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLifecycleEnvironment } from "./infrastructure-lifecycle-core.js";
export { inspectLifecycleResources } from "./infrastructure-lifecycle-inspection.js";

export function executeLifecycleCommand(root, commandLog, command, args, environment = {}) {
  return new Promise((resolveCommand, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: root,
      stdio: "pipe",
      windowsHide: true,
      env: { ...process.env, ...environment },
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      commandLog.push({
        command,
        args,
        exitCode: exitCode ?? null,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
      if (exitCode === 0) {
        resolveCommand(output.trim());
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit ${exitCode ?? "unknown"}: ${output.slice(-2000)}`));
      }
    });
  });
}

export function writeLifecycleEvidence(context, phase, inventory, commandLog, timing = {}) {
  mkdirSync(context.evidenceDirectory, { recursive: true });
  const path = resolve(context.evidenceDirectory, `${phase}.json`);
  writeFileSync(
    path,
    `${JSON.stringify({
      phase,
      context,
      inventory,
      commands: [...commandLog],
      timings: { recordedAt: new Date().toISOString(), ...timing },
    }, null, 2)}\n`,
    "utf8",
  );
  return path;
}

export function lifecycleEnvironmentWithContext(context, contextPath) {
  return { ...buildLifecycleEnvironment(context), SEOVISTA_LIFECYCLE_CONTEXT_PATH: contextPath };
}

/* global process */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const URL = globalThis.URL;
import { createLifecycleController, resolveContextArgument } from "./infrastructure-lifecycle-cli.js";

export async function runLifecycleCli(argv, stdout = process.stdout, controllerReady = () => undefined) {
  const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
  const root = resolve(scriptDirectory, "..");
  const controller = createLifecycleController(root);
  controllerReady(controller);
  const [command, value, service] = argv;

  if (command === "start") {
    const contextPath = await controller.start(value);
    stdout.write(`${contextPath}\n`);
    return { controller, exitCode: 0 };
  }
  if (command === "teardown") {
    await controller.teardown(resolveContextArgument(value, root));
    return { controller, exitCode: 0 };
  }
  if (command === "health") {
    await controller.health(resolveContextArgument(value, root), service);
    return { controller, exitCode: 0 };
  }
  throw new Error("Usage: node scripts/infrastructure-lifecycle.js <start|teardown|health> [run-id|context-file] [service]");
}

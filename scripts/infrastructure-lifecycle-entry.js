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
  const [command, value, thirdArgument] = argv;
  const usage = "Usage: node scripts/infrastructure-lifecycle.js start [run-id] [nonce] | teardown <context-file> | health <context-file> <service>";

  if (command === "start" && argv.length <= 3) {
    const contextPath = await controller.start(value, thirdArgument);
    stdout.write(`${contextPath}\n`);
    return { controller, exitCode: 0 };
  }
  if (command === "teardown" && argv.length === 2) {
    await controller.teardown(resolveContextArgument(value, root));
    return { controller, exitCode: 0 };
  }
  if (command === "health" && argv.length === 3) {
    await controller.health(resolveContextArgument(value, root), thirdArgument);
    return { controller, exitCode: 0 };
  }
  throw new Error(usage);
}

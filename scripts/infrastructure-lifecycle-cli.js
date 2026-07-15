import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertContextAuthority,
  buildLifecycleCommands,
  createRunContext,
  getContextPath,
  readTrustedLifecycleContext,
  retireLifecycleContext,
  writeLifecycleContext,
} from "./infrastructure-lifecycle-core.js";
import {
  executeLifecycleCommand,
  inspectLifecycleResources,
  lifecycleEnvironmentWithContext,
  writeLifecycleEvidence,
} from "./infrastructure-lifecycle-runtime.js";

export function createLifecycleController(root, dependencies = {}) {
  const commandLog = [];
  let activeRun;
  let operationQueue = Promise.resolve();

  function serialize(operation) {
    const next = operationQueue.then(operation, operation);
    operationQueue = next.catch(() => undefined);
    return next;
  }
  const executeCommand = dependencies.executeCommand ?? executeLifecycleCommand;
  const inspectResources = dependencies.inspectResources ?? inspectLifecycleResources;
  const execute = (command, args, environment = {}) =>
    executeCommand(root, commandLog, command, args, environment);

  function readOwnedContext(contextPath, options = {}) {
    const trusted = readTrustedLifecycleContext(contextPath, root, options);
    assertContextAuthority(trusted.context, trusted.context);
    return trusted;
  }

  async function teardownInternal(contextPath, expectedContext) {
    const trusted = readOwnedContext(contextPath, { allowRetired: true });
    const authoritative = trusted.context;
    if (expectedContext) assertContextAuthority(expectedContext, authoritative);
    const context = authoritative;
    const commands = buildLifecycleCommands(context);
    const environment = lifecycleEnvironmentWithContext(context, contextPath);
    const timing = { startedAt: new Date().toISOString() };
    let before;
    try {
      before = await inspectResources(context, execute);
    } catch (error) {
      writeLifecycleEvidence(context, "before-teardown-inspection-error", { error: String(error) }, commandLog, timing);
      throw error;
    }
    writeLifecycleEvidence(context, "before-teardown", before, commandLog, timing);

    const hasRejectedResources = Object.values(before.rejectedProjectResources).some((resources) => resources.length > 0);
    if (hasRejectedResources) {
      throw new Error("Lifecycle teardown rejected project resources with missing or mismatched ownership tokens");
    }

    if (trusted.status !== "retired") {
      try {
        await execute(commands.teardown.command, commands.teardown.args, environment);
      } catch (error) {
        const message = String(error);
        if (!/no resource found|no such project|not found/i.test(message)) throw error;
      }
    }

    const finishedAt = new Date().toISOString();
    const after = await inspectResources(context, execute);
    writeLifecycleEvidence(context, "after-teardown", after, commandLog, {
      ...timing,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(timing.startedAt).getTime(),
    });
    const hasOwnedListeners = after.listeners.some((listener) => {
      const localPort = typeof listener === "string" ? listener : String(listener?.LocalPort ?? "");
      return localPort.includes(String(context.hostPorts.postgres)) || localPort.includes(String(context.hostPorts.redis));
    });
    const hasRemainingResources =
      after.containers.length > 0 ||
      after.networks.length > 0 ||
      after.volumes.length > 0 ||
      hasOwnedListeners ||
      after.databases.includes(context.databaseName) ||
      after.redisNamespaces.length > 0 ||
      after.queues.length > 0 ||
      Object.values(after.rejectedProjectResources).some((resources) => resources.length > 0);
    if (hasRemainingResources) {
      throw new Error("Lifecycle teardown did not prove complete owned cleanup");
    }
    const ownedBefore = {
      containers: new Set(before.containers),
      networks: new Set(before.networks),
      volumes: new Set(before.volumes),
    };
    const unrelatedBefore = {
      containers: before.unrelatedFingerprints.containers.filter((name) => !ownedBefore.containers.has(name)),
      networks: before.unrelatedFingerprints.networks.filter((name) => !ownedBefore.networks.has(name)),
      volumes: before.unrelatedFingerprints.volumes.filter((name) => !ownedBefore.volumes.has(name)),
    };
    if (JSON.stringify(after.unrelatedFingerprints) !== JSON.stringify(unrelatedBefore)) {
      throw new Error("Lifecycle teardown detected changed unrelated resource fingerprints");
    }
    if (trusted.status !== "retired") retireLifecycleContext(contextPath, root);
    return context;
  }

  async function startInternal(requestedRunId) {
    const context = createRunContext({ runId: requestedRunId, root });
    const contextPath = getContextPath(context, root);
    const commands = buildLifecycleCommands(context);
    const environment = lifecycleEnvironmentWithContext(context, contextPath);
    activeRun = { context, contextPath };
    writeLifecycleContext(context, contextPath, { root });
    try {
      writeLifecycleEvidence(context, "before-start", await inspectResources(context, execute), commandLog);
      await execute(commands.start.command, commands.start.args, environment);
      writeLifecycleEvidence(context, "after-start", await inspectResources(context, execute), commandLog);
      return contextPath;
    } catch (error) {
      try {
        await teardownInternal(contextPath, context);
      } catch (cleanupError) {
        writeLifecycleEvidence(
          context,
          "failed-start-cleanup-error",
          { startupError: String(error), cleanupError: String(cleanupError) },
          commandLog,
        );
        if (error instanceof Error) {
          Object.defineProperty(error, "cleanupError", { value: cleanupError, enumerable: false });
        }
      }
      throw error;
    }
  }

  async function health(contextPath, service) {
    const context = readOwnedContext(contextPath).context;
    const commands = buildLifecycleCommands(context);
    await execute(
      commands.health.command,
      commands.health.args(service),
      lifecycleEnvironmentWithContext(context, contextPath),
    );
    return true;
  }

  async function start(requestedRunId) {
    return serialize(() => startInternal(requestedRunId));
  }

  async function teardown(contextPath, expectedContext) {
    return serialize(() => teardownInternal(contextPath, expectedContext));
  }

  async function interruptCleanupInternal() {
    if (!activeRun) return;
    const { context, contextPath } = activeRun;
    try {
      await teardownInternal(contextPath, context);
      activeRun = undefined;
    } catch (cleanupError) {
      writeLifecycleEvidence(
        context,
        "interrupt-cleanup-error",
        { cleanupError: String(cleanupError) },
        commandLog,
      );
      throw cleanupError;
    }
  }

  async function interruptCleanup() {
    return serialize(interruptCleanupInternal);
  }

  return { start, teardown, health, interruptCleanup, getActiveRun: () => activeRun };
}

export function resolveContextArgument(value, root) {
  if (!value) throw new Error("Lifecycle context path is required");
  const path = resolve(root, value);
  if (!path.endsWith("-context.json") || !existsSync(path)) {
    throw new Error("Lifecycle teardown requires the exact generated *-context.json path");
  }
  return path;
}

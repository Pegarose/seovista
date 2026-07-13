#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(scriptDirectory, "..");
const evidenceDirectory = resolve(root, ".lifecycle-evidence");
const identityPattern = /^[a-z][a-z0-9-]{2,47}$/;
let activeContext = null;
let activeCommands = null;

export function sanitizeRunIdentity(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  if (!identityPattern.test(normalized)) {
    throw new Error("Lifecycle identity must normalize to 3-48 safe lowercase characters");
  }

  return normalized;
}

export function createRunContext(options = {}) {
  const nonce = randomBytes(6).toString("hex");
  const runId = sanitizeRunIdentity(options.runId ?? `seovista-run-${Date.now()}-${nonce}`);

  return Object.freeze({
    runId,
    projectId: runId,
    composeProject: runId,
    databaseName: runId,
    redisNamespace: runId,
    queueName: `${runId}-ping`,
    correlationId: `${runId}-${nonce}`,
  });
}

export function buildLifecycleCommands(context) {
  return {
    start: {
      command: "docker",
      args: ["compose", "-p", context.composeProject, "up", "-d", "--wait", "postgres", "redis"],
    },
    teardown: {
      command: "docker",
      args: [
        "compose",
        "-p",
        context.composeProject,
        "down",
        "--volumes",
        "--remove-orphans",
        "--timeout",
        "30",
      ],
    },
  };
}

export function isOwnedResource(name, context) {
  return name.startsWith(`${context.composeProject}-`) || name.startsWith(`${context.composeProject}_`);
}

function execute(command, args, environment = {}) {
  return new Promise((resolveCommand, reject) => {
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
      if (exitCode === 0) {
        resolveCommand(output.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit ${exitCode ?? "unknown"}: ${output.slice(-2000)}`));
    });
  });
}

async function inspect(context) {
  const filter = `label=com.docker.compose.project=${context.composeProject}`;
  const [containers, networks, volumes] = await Promise.all([
    execute("docker", ["ps", "-a", "--filter", filter, "--format", "{{.Names}}"]),
    execute("docker", ["network", "ls", "--filter", filter, "--format", "{{.Name}}"]),
    execute("docker", ["volume", "ls", "--filter", filter, "--format", "{{.Name}}"]),
  ]);

  return {
    containers: containers ? containers.split(/\r?\n/) : [],
    networks: networks ? networks.split(/\r?\n/) : [],
    volumes: volumes ? volumes.split(/\r?\n/) : [],
  };
}

function isContextPath(value) {
  return value?.endsWith("-context.json") && existsSync(value);
}

async function teardown(context, commands) {
  writeEvidence(context, "before-teardown", await inspect(context));
  await execute(commands.teardown.command, commands.teardown.args, {
    SEOVISTA_DATABASE_NAME: context.databaseName,
  });
  writeEvidence(context, "after-teardown", await inspect(context));
}

function writeEvidence(context, phase, inventory) {
  mkdirSync(evidenceDirectory, { recursive: true });
  const path = resolve(evidenceDirectory, `${context.runId}-${phase}.json`);
  writeFileSync(
    path,
    `${JSON.stringify({ phase, context, inventory, recordedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return path;
}

function readContext(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed.context;
}

async function main() {
  const [command, value] = process.argv.slice(2);
  const contextPath = value && existsSync(value) ? resolve(value) : undefined;
  if (contextPath && !isContextPath(contextPath)) {
    throw new Error("Lifecycle context must be a generated *-context.json file");
  }

  const context = activeContext ?? (contextPath ? readContext(contextPath) : createRunContext(value ? { runId: value } : undefined));
  const commands = activeCommands ?? buildLifecycleCommands(context);
  const evidencePath = resolve(evidenceDirectory, `${context.runId}-context.json`);

  if (command === "start") {
    writeEvidence(context, "before", await inspect(context));
    try {
      await execute(commands.start.command, commands.start.args, {
        SEOVISTA_DATABASE_NAME: context.databaseName,
      });
      writeEvidence(context, "after-start", await inspect(context));
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(evidencePath, `${JSON.stringify({ context }, null, 2)}\n`, "utf8");
      process.stdout.write(`${evidencePath}\n`);
    } catch (error) {
      await teardown(context, commands).catch(() => undefined);
      throw error;
    }
    return;
  }

  if (command === "teardown") {
    await teardown(context, commands);
    return;
  }

  throw new Error("Usage: node scripts/infrastructure-lifecycle.js <start|teardown> [run-id|context-file]");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let cleaningUp = false;

  const cleanupOnInterrupt = async () => {
    if (cleaningUp || !activeContext || !activeCommands) return;
    cleaningUp = true;
    await teardown(activeContext, activeCommands).catch(() => undefined);
  };

  process.once("SIGINT", () => {
    cleanupOnInterrupt().finally(() => process.exit(1));
  });
  process.once("SIGTERM", () => {
    cleanupOnInterrupt().finally(() => process.exit(1));
  });

  const [command, value] = process.argv.slice(2);
  if (command === "start") {
    const contextPath = value && existsSync(value) ? resolve(value) : undefined;
    activeContext = contextPath ? readContext(contextPath) : createRunContext(value ? { runId: value } : undefined);
    activeCommands = buildLifecycleCommands(activeContext);
  }

  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "lifecycle failure"}\n`);
    process.exitCode = 1;
  });
}

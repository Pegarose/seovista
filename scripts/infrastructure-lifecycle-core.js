import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { dirname, resolve } from "node:path";
import { cwd, pid } from "node:process";

export const LIFECYCLE_CONTEXT_SCHEMA_VERSION = 1;
export const DEFAULT_HOST_PORTS = Object.freeze({ postgres: 55432, redis: 56379 });
export const OWNERSHIP_TOKEN_LABEL = "com.seovista.lifecycle.token";
export const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";

const REGISTRY_SCHEMA_VERSION = 1;
const REGISTRY_DIRECTORY_NAME = ".lifecycle-registry";
const REGISTRY_FILE_NAME = "registry.json";
const REGISTRY_RECORDS_DIRECTORY_NAME = "records";
const REGISTRY_KEY_FILE_NAME = "authority.key";
const identityPattern = /^[a-z][a-z0-9-]{2,47}$/;

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

function createRunId(baseIdentity, nonce) {
  const suffix = nonce.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (suffix.length < 6) {
    throw new Error("Lifecycle nonce must contain at least 6 safe characters");
  }
  const maxBaseLength = 48 - suffix.length - 1;
  const boundedBase = baseIdentity.slice(0, maxBaseLength).replace(/-+$/g, "");
  return sanitizeRunIdentity(`${boundedBase}-${suffix}`);
}

function assertPort(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

export function getContextPath(context, root) {
  return resolve(root, ".lifecycle-evidence", `${context.runId}-context.json`);
}

export function getRegistryPath(root) {
  return resolve(root, REGISTRY_DIRECTORY_NAME, REGISTRY_FILE_NAME);
}

function getRegistryKeyPath(root) {
  return resolve(root, REGISTRY_DIRECTORY_NAME, REGISTRY_KEY_FILE_NAME);
}

function getRegistryRecordPath(root, contextPath) {
  const recordName = `${createHash("sha256").update(canonicalizeLifecyclePath(contextPath)).digest("hex")}.json`;
  return resolve(root, REGISTRY_DIRECTORY_NAME, REGISTRY_RECORDS_DIRECTORY_NAME, recordName);
}

export function canonicalizeLifecyclePath(path, operatingSystem = platform()) {
  const resolvedPath = resolve(path).replaceAll("\\", "/");
  return operatingSystem === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
}

function readOrCreateRegistryKey(root) {
  const keyPath = getRegistryKeyPath(root);
  if (existsSync(keyPath)) return readFileSync(keyPath, "utf8").trim();
  mkdirSync(dirname(keyPath), { recursive: true });
  const key = randomBytes(32).toString("hex");
  try {
    writeFileSync(keyPath, `${key}\n`, { encoding: "utf8", flag: "wx" });
    return key;
  } catch (error) {
    if (error?.code === "EEXIST") return readFileSync(keyPath, "utf8").trim();
    throw error;
  }
}

function readRegistry(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return { schemaVersion: REGISTRY_SCHEMA_VERSION, entries: {} };
  const registry = JSON.parse(readFileSync(path, "utf8"));
  if (registry?.schemaVersion !== REGISTRY_SCHEMA_VERSION || !registry.entries) {
    throw new Error("Lifecycle trusted registry schema is invalid");
  }
  return registry;
}

function readRegistryRecord(root, contextPath) {
  const recordPath = getRegistryRecordPath(root, contextPath);
  if (existsSync(recordPath)) return JSON.parse(readFileSync(recordPath, "utf8"));
  return readRegistry(root).entries[canonicalizeLifecyclePath(contextPath)];
}

function writeRegistryRecord(root, contextPath, entry, options = {}) {
  const path = getRegistryRecordPath(root, contextPath);
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  if (options.exclusive && existsSync(path)) {
    throw new Error("Lifecycle trusted registry already contains this canonical context path");
  }
  renameSync(tempPath, path);
}

function immutableContextAuthority(context) {
  return {
    schemaVersion: context.schemaVersion,
    runId: context.runId,
    projectId: context.projectId,
    composeProject: context.composeProject,
    databaseName: context.databaseName,
    redisNamespace: context.redisNamespace,
    redisDatabase: context.redisDatabase,
    queuePrefix: context.queuePrefix,
    correlationIdPrefix: context.correlationIdPrefix,
    hostPorts: {
      postgres: context.hostPorts?.postgres,
      redis: context.hostPorts?.redis,
    },
    createdAt: context.createdAt,
    cleanupAuthority: context.cleanupAuthority,
    evidenceDirectory: canonicalizeLifecyclePath(context.evidenceDirectory),
    ownershipToken: context.ownershipToken,
  };
}

function registryAuthority(contextPath, context, key) {
  return createHmac("sha256", key)
    .update(
      JSON.stringify({
        canonicalContextPath: canonicalizeLifecyclePath(contextPath),
        context: immutableContextAuthority(context),
      }),
    )
    .digest("hex");
}

function registerLifecycleContext(context, contextPath, root) {
  const canonicalContextPath = canonicalizeLifecyclePath(contextPath);
  if (readRegistryRecord(root, contextPath)) {
    throw new Error("Lifecycle trusted registry already contains this canonical context path");
  }
  const key = readOrCreateRegistryKey(root);
  writeRegistryRecord(
    root,
    contextPath,
    {
      canonicalContextPath,
      runId: context.runId,
      status: "active",
      authority: registryAuthority(contextPath, context, key),
    },
    { exclusive: true },
  );
}

export function createRunContext(options = {}) {
  const nonce = options.nonce ?? randomBytes(6).toString("hex");
  const baseIdentity = sanitizeRunIdentity(options.runId ?? "seovista-run");
  const runId = createRunId(baseIdentity, nonce);
  const hostPorts = Object.freeze({
    postgres: assertPort(options.hostPorts?.postgres ?? DEFAULT_HOST_PORTS.postgres, "PostgreSQL port"),
    redis: assertPort(options.hostPorts?.redis ?? DEFAULT_HOST_PORTS.redis, "Redis port"),
  });
  const ownershipToken = options.ownershipToken ?? randomBytes(32).toString("hex");
  if (!/^[a-f0-9]{64}$/i.test(ownershipToken)) {
    throw new Error("Lifecycle ownership token must be a 64-character hexadecimal value");
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  const evidenceDirectory = resolve(options.root ?? cwd(), ".lifecycle-evidence", runId);

  return Object.freeze({
    schemaVersion: LIFECYCLE_CONTEXT_SCHEMA_VERSION,
    runId,
    projectId: runId,
    composeProject: runId,
    databaseName: runId.replaceAll("-", "_"),
    redisNamespace: `${runId}:`,
    redisDatabase: 0,
    queuePrefix: `${runId}:queue`,
    correlationIdPrefix: `${runId}-correlation-`,
    hostPorts,
    createdAt,
    cleanupAuthority: `context:${runId}`,
    evidenceDirectory,
    ownershipToken: ownershipToken.toLowerCase(),
  });
}

export function buildLifecycleEnvironment(context) {
  return Object.freeze({
    COMPOSE_PROJECT_NAME: context.composeProject,
    SEOVISTA_DATABASE_NAME: context.databaseName,
    SEOVISTA_REDIS_NAMESPACE: context.redisNamespace,
    SEOVISTA_REDIS_DATABASE: String(context.redisDatabase),
    SEOVISTA_QUEUE_PREFIX: context.queuePrefix,
    SEOVISTA_CORRELATION_ID_PREFIX: context.correlationIdPrefix,
    SEOVISTA_POSTGRES_PORT: String(context.hostPorts.postgres),
    SEOVISTA_REDIS_PORT: String(context.hostPorts.redis),
    SEOVISTA_OWNERSHIP_TOKEN: context.ownershipToken,
    SEOVISTA_LIFECYCLE_CONTEXT_PATH: "",
  });
}

export function buildLifecycleCommands(context) {
  return Object.freeze({
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
    health: {
      command: "docker",
      args(service) {
        if (!['postgres', 'redis'].includes(service)) {
          throw new Error(`Unknown lifecycle service: ${String(service)}`);
        }
        return [
          "compose",
          "-p",
          context.composeProject,
          "exec",
          "-T",
          service,
          ...(service === "postgres"
            ? ["pg_isready", "-U", "seovista", "-d", context.databaseName]
            : ["redis-cli", "-n", String(context.redisDatabase), "ping"]),
        ];
      },
    },
  });
}

function stableContextAuthority(context) {
  return createHash("sha256").update(JSON.stringify(immutableContextAuthority(context))).digest("hex");
}

export function writeLifecycleContext(context, path, options = {}) {
  const canonicalContextPath = canonicalizeLifecyclePath(path);
  const expectedPath = canonicalizeLifecyclePath(getContextPath(context, options.root ?? resolve(path, "../../")));
  if (options.register !== false && canonicalContextPath !== expectedPath) {
    throw new Error("Lifecycle context path must match its canonical generated path");
  }
  mkdirSync(dirname(path), { recursive: true });
  const record = {
    schemaVersion: LIFECYCLE_CONTEXT_SCHEMA_VERSION,
    context,
    authorityDigest: stableContextAuthority(context),
  };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  if (options.register !== false) registerLifecycleContext(context, path, options.root ?? resolve(path, "../../"));
  return path;
}

export function readLifecycleContext(path) {
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (record?.schemaVersion !== LIFECYCLE_CONTEXT_SCHEMA_VERSION || !record.context) {
    throw new Error("Lifecycle context schema is invalid");
  }
  if (record.authorityDigest !== stableContextAuthority(record.context)) {
    throw new Error("Lifecycle context ownership authority is invalid or stale");
  }
  return Object.freeze(record.context);
}

export function readTrustedLifecycleContext(path, root, options = {}) {
  const context = readLifecycleContext(path);
  const canonicalContextPath = canonicalizeLifecyclePath(path);
  const expectedPath = canonicalizeLifecyclePath(getContextPath(context, root));
  if (canonicalContextPath !== expectedPath) {
    throw new Error("Lifecycle teardown context does not use its canonical generated path");
  }
  const entry = readRegistryRecord(root, path);
  if (!entry) throw new Error("Lifecycle context is absent from the trusted registry");
  const key = readOrCreateRegistryKey(root);
  if (entry.authority !== registryAuthority(path, context, key) || entry.runId !== context.runId) {
    throw new Error("Lifecycle trusted registry authority mismatch");
  }
  if (entry.status === "retired" && !options.allowRetired) {
    throw new Error("Lifecycle trusted registry record is retired");
  }
  return Object.freeze({ context, status: entry.status });
}

export function retireLifecycleContext(path, root) {
  const trusted = readTrustedLifecycleContext(path, root, { allowRetired: true });
  if (trusted.status === "retired") return false;
  const entry = readRegistryRecord(root, path);
  entry.status = "retired";
  entry.retiredAt = new Date().toISOString();
  writeRegistryRecord(root, path, entry);
  return true;
}

export function assertContextAuthority(candidate, authoritative) {
  if (
    !candidate ||
    !authoritative ||
    JSON.stringify(immutableContextAuthority(candidate)) !== JSON.stringify(immutableContextAuthority(authoritative))
  ) {
    throw new Error("Lifecycle cleanup authority or ownership token mismatch");
  }
  return true;
}

export function resourceMatchesOwnership(labels, context) {
  return (
    labels?.[COMPOSE_PROJECT_LABEL] === context.composeProject &&
    labels?.[OWNERSHIP_TOKEN_LABEL] === context.ownershipToken
  );
}

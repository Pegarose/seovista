import { platform } from "node:os";
import { resourceMatchesOwnership } from "./infrastructure-lifecycle-core.js";

const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";

function splitLines(output) {
  return output ? output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

async function dockerJson(execute, objectType, name) {
  const output = await execute("docker", [objectType, "inspect", name]);
  const parsed = JSON.parse(output);
  const inspection = parsed[0];
  if (!inspection) throw new Error(`Docker ${objectType} inspection returned no record for ${name}`);
  return inspection;
}

function labelsFromInspection(inspection) {
  return inspection?.Config?.Labels ?? inspection?.Labels ?? {};
}

async function listOwnedDockerResources(context, execute) {
  const projectFilter = `label=com.docker.compose.project=${context.composeProject}`;
  const [containersOutput, networksOutput, volumesOutput] = await Promise.all([
    execute("docker", ["ps", "-a", "--filter", projectFilter, "--format", "{{.Names}}"]),
    execute("docker", ["network", "ls", "--filter", projectFilter, "--format", "{{.Name}}"]),
    execute("docker", ["volume", "ls", "--filter", projectFilter, "--format", "{{.Name}}"]),
  ]);
  const candidates = {
    containers: splitLines(containersOutput),
    networks: splitLines(networksOutput),
    volumes: splitLines(volumesOutput),
  };
  const owned = { containers: [], networks: [], volumes: [] };
  const rejected = { containers: [], networks: [], volumes: [] };
  const ownedServiceStates = {};

  for (const [kind, names] of Object.entries(candidates)) {
    const objectType = kind === "containers" ? "container" : kind === "networks" ? "network" : "volume";
    for (const name of names) {
      const inspection = await dockerJson(execute, objectType, name);
      const labels = labelsFromInspection(inspection);
      if (resourceMatchesOwnership(labels, context)) {
        owned[kind].push(name);
        if (kind === "containers") {
          const service = labels[COMPOSE_SERVICE_LABEL];
          if (service) ownedServiceStates[service] = inspection?.State?.Running === true;
        }
      } else {
        rejected[kind].push(name);
      }
    }
  }
  return { owned, rejected, ownedServiceStates };
}

async function listUnrelatedFingerprints(execute) {
  const [containers, networks, volumes] = await Promise.all([
    execute("docker", ["ps", "-a", "--format", "{{.Names}}"]),
    execute("docker", ["network", "ls", "--format", "{{.Name}}"]),
    execute("docker", ["volume", "ls", "--format", "{{.Name}}"]),
  ]);
  return {
    containers: splitLines(containers),
    networks: splitLines(networks).filter((name) => !["bridge", "host", "none"].includes(name)),
    volumes: splitLines(volumes),
  };
}

export function buildUnixListenerProbeScript(ports) {
  const portPattern = ports.join("|");
  return `output=$(ss -tlnp) || exit $?\nprintf '%s\\n' "$output" | grep -E ':(${portPattern})' || test $? -eq 1`;
}

async function inspectListeners(context, execute) {
  const ports = [context.hostPorts.postgres, context.hostPorts.redis];
  try {
    if (platform() === "win32") {
      const output = await execute("powershell.exe", [
        "-NoProfile",
        "-Command",
        `$ErrorActionPreference = 'Stop'; $ports = @(${ports.join(",")}); @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.State -eq 'Listen' -and $ports -contains $_.LocalPort }) | Select-Object LocalAddress,LocalPort,State,OwningProcess | ConvertTo-Json -Compress`,
      ]);
      if (!output) return { state: "observed", values: [] };
      const parsed = JSON.parse(output);
      const connections = Array.isArray(parsed) ? parsed : [parsed];
      return {
        state: "observed",
        values: connections.filter((connection) => connection?.State === 2 || connection?.State === "Listen"),
      };
    }
    const output = await execute("sh", ["-c", buildUnixListenerProbeScript(ports)]);
    return { state: "observed", values: splitLines(output) };
  } catch (error) {
    return { state: "inspection_failed", values: [], error: String(error) };
  }
}

async function inspectDatabases(context, execute, postgresAvailable) {
  if (!postgresAvailable) return { state: "service_unavailable", values: [] };
  try {
    const output = await execute("docker", [
      "compose", "-p", context.composeProject, "exec", "-T", "postgres",
      "psql", "-U", "seovista", "-d", "postgres", "-t", "-A", "-c",
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
    ]);
    return { state: "observed", values: splitLines(output) };
  } catch (error) {
    return { state: "inspection_failed", values: [], error: String(error) };
  }
}

async function inspectRedis(context, execute, redisAvailable) {
  if (!redisAvailable) return { state: "service_unavailable", namespaceKeys: [], queues: [] };
  try {
    const [keys, queues] = await Promise.all([
      execute("docker", [
        "compose", "-p", context.composeProject, "exec", "-T", "redis", "redis-cli",
        "-n", String(context.redisDatabase), "--scan", "--pattern", `${context.redisNamespace}*`,
      ]),
      execute("docker", [
        "compose", "-p", context.composeProject, "exec", "-T", "redis", "redis-cli",
        "-n", String(context.redisDatabase), "--scan", "--pattern", `${context.queuePrefix}:*`,
      ]),
    ]);
    return { state: "observed", namespaceKeys: splitLines(keys), queues: splitLines(queues) };
  } catch (error) {
    return { state: "inspection_failed", namespaceKeys: [], queues: [], error: String(error) };
  }
}

export async function inspectLifecycleResources(context, execute) {
  const [dockerResources, unrelated, listeners] = await Promise.all([
    listOwnedDockerResources(context, execute),
    listUnrelatedFingerprints(execute),
    inspectListeners(context, execute),
  ]);
  const postgresAvailable = dockerResources.ownedServiceStates.postgres === true;
  const redisAvailable = dockerResources.ownedServiceStates.redis === true;
  const [databases, redis] = await Promise.all([
    inspectDatabases(context, execute, postgresAvailable),
    inspectRedis(context, execute, redisAvailable),
  ]);
  const failedInspection = [listeners, databases, redis].find((inspection) => inspection.state === "inspection_failed");
  if (failedInspection) throw new Error(failedInspection.error);
  return {
    containers: dockerResources.owned.containers,
    networks: dockerResources.owned.networks,
    volumes: dockerResources.owned.volumes,
    rejectedProjectResources: dockerResources.rejected,
    listeners: listeners.values,
    databases: databases.values,
    redisNamespaces: redis.namespaceKeys,
    queues: redis.queues,
    inspectionStates: { listeners, databases, redis },
    unrelatedFingerprints: unrelated,
  };
}

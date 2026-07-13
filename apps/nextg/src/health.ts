export interface NextgHealthReport {
  name: string;
  capability: "mock";
  liveness: "live" | "dead";
  readiness: "ready" | "not_ready";
  dependencies: { name: string; status: "up" | "down" | "unknown" }[];
  timestamp: string;
}

export function checkNextgHealth(now: () => Date = () => new Date("2026-07-01T00:00:00.000Z")): NextgHealthReport {
  return {
    name: "@seovista/nextg",
    capability: "mock",
    liveness: "live",
    readiness: "ready",
    dependencies: [],
    timestamp: now().toISOString(),
  };
}

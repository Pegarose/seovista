export interface NextgHealthReport {
  name: string;
  liveness: "live" | "dead";
  readiness: "ready" | "not_ready";
  dependencies: { name: string; status: "up" | "down" | "unknown" }[];
  timestamp: string;
}

export function checkNextgHealth(): NextgHealthReport {
  return {
    name: "@seovista/nextg",
    liveness: "live",
    readiness: "ready",
    dependencies: [],
    timestamp: new Date().toISOString(),
  };
}

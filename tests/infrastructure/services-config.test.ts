import { readFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("services.yaml infrastructure ownership", () => {
  it("routes PostgreSQL and Redis through one durable exact-context coordinator", () => {
    const services = readFileSync(resolve(root, "services.yaml"), "utf8");

    expect(services).not.toContain("seovista-dev-context.json");
    expect(services.match(/infrastructure-service-coordinator\.js start/g)).toHaveLength(2);
    expect(services).toContain("infrastructure-service-coordinator.js health postgres");
    expect(services).toContain("infrastructure-service-coordinator.js health redis");
    expect(services.match(/infrastructure-service-coordinator\.js stop/g)).toHaveLength(2);
    expect(services).toContain("depends_on: [postgres]");
  });

  it("assigns Redis start and stop to lifecycle operations while health remains a healthcheck", () => {
    const services = readFileSync(resolve(root, "services.yaml"), "utf8");
    const redis = services.match(/  redis:\n((?:    .*\n)+)/)?.[1];

    expect(redis).toBeDefined();
    expect(redis).toContain("start: node scripts/infrastructure-service-coordinator.js start");
    expect(redis).toContain("stop: node scripts/infrastructure-service-coordinator.js stop");
    expect(redis).toContain("healthcheck: node scripts/infrastructure-service-coordinator.js health redis");
  });
});

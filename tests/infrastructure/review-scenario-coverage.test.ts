import { describe, expect, it } from "vitest";
import { createRunContext } from "../../scripts/infrastructure-lifecycle-core.js";

const context = createRunContext({
  root: "C:/repo",
  runId: "scenario-contract",
  nonce: "123456789abc",
  ownershipToken: "a".repeat(64),
  createdAt: "2026-07-15T00:00:00.000Z",
});

describe("Phase 1 review scenario contract", () => {
  it("defines distinct owned Redis and BullMQ keyspaces without including unrelated keys", () => {
    const namespaceKey = `${context.redisNamespace}scenario`;
    const queueKey = `${context.queuePrefix}:scenario-ping:meta`;
    const unrelatedKey = `unrelated:${context.runId}`;

    expect(namespaceKey.startsWith(context.redisNamespace)).toBe(true);
    expect(queueKey.startsWith(`${context.queuePrefix}:`)).toBe(true);
    expect(unrelatedKey.startsWith(context.redisNamespace)).toBe(false);
    expect(unrelatedKey.startsWith(`${context.queuePrefix}:`)).toBe(false);
  });

  it("keeps lifecycle database, namespace, queue, and correlation identities run-scoped", () => {
    expect(context.databaseName).toBe(context.runId.replaceAll("-", "_"));
    expect(context.redisNamespace).toBe(`${context.runId}:`);
    expect(context.queuePrefix).toBe(`${context.runId}:queue`);
    expect(context.correlationIdPrefix).toBe(`${context.runId}-correlation-`);
  });
});

import { describe, expect, it } from "vitest";
import { AUDIT_POLL_TIMEOUT_MS, hasAuditPollingExpired } from "../audit-polling";

describe("audit polling bounds", () => {
  it("expires after the maximum polling window", () => {
    const startedAt = 1_000;

    expect(hasAuditPollingExpired(startedAt, startedAt + AUDIT_POLL_TIMEOUT_MS - 1)).toBe(false);
    expect(hasAuditPollingExpired(startedAt, startedAt + AUDIT_POLL_TIMEOUT_MS)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizeAuditStatus,
  normalizeAuditStatusRecord,
  toAuthoritativeAuditStatus,
} from "../audit-status";

describe("GEO status compatibility boundary", () => {
  it.each([
    ["queued", "queued"],
    ["running", "running"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["permanent", "permanent"],
    ["timeout", "timeout"],
    ["pending", "queued"],
    ["permanent_failure", "permanent"],
  ] as const)("maps public status %s to persisted status %s", (value, expected) => {
    expect(toAuthoritativeAuditStatus(value)).toBe(expected);
  });

  it("rejects unknown values instead of inventing a persisted status", () => {
    expect(toAuthoritativeAuditStatus("future_status")).toBeNull();
    expect(normalizeAuditStatus("future_status")).toBe("unknown");
  });

  it("preserves the public alias while retaining the raw persisted value", () => {
    const normalized = normalizeAuditStatusRecord({
      status: "permanent_failure",
      lead_id: "lead-1",
    });

    expect(normalized.status).toBe("permanent_failure");
    expect((normalized as any).persistedStatus).toBeUndefined();
  });
});

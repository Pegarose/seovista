import { describe, expect, it, vi } from "vitest";
import {
  auditOutcomeSchema,
  normalizeAuditOutcome,
  projectAuditOutcomeForLog,
  serializeAuditOutcome,
} from "../index.js";

const safeContext = {
  correlationId: "audit-contract-123",
  durationMs: 125,
};

const syntheticFailures = [
  { kind: "timeout", phase: "request", ...safeContext },
  { kind: "response_size", phase: "response", ...safeContext },
  { kind: "content_type", phase: "response", ...safeContext },
  { kind: "redirect", phase: "redirect", ...safeContext },
  { kind: "cancellation", phase: "cancellation", ...safeContext },
  { kind: "execution", phase: "execution", ...safeContext },
] as const;

describe("audit outcome normalization", () => {
  it("normalizes a complete synthetic result as the only success shape", () => {
    const outcome = normalizeAuditOutcome({
      kind: "success",
      complete: true,
      phase: "complete",
      ...safeContext,
    });

    expect(outcome).toEqual({
      outcome: "success",
      phase: "complete",
      ...safeContext,
    });
    expect(auditOutcomeSchema.safeParse(outcome).success).toBe(true);
  });

  it("normalizes every finite failure class to a typed failure", () => {
    const outcomes = [
      ...syntheticFailures.map((input) => normalizeAuditOutcome(input)),
      normalizeAuditOutcome({ kind: "success", complete: false, ...safeContext }),
      normalizeAuditOutcome({ outcome: "success", phase: "complete" }),
    ];

    expect(outcomes).toMatchSnapshot();
    expect(outcomes.map((outcome) => outcome.outcome)).toEqual([
      "failure",
      "failure",
      "failure",
      "failure",
      "failure",
      "failure",
      "failure",
      "failure",
    ]);
    expect(
      outcomes.map((outcome) => {
        if (outcome.outcome !== "failure") {
          throw new Error("failure matrix must not include success");
        }
        return outcome.errorClass;
      }),
    ).toEqual([
      "timeout",
      "response_size",
      "content_type",
      "redirect",
      "cancellation",
      "execution",
      "partial_result",
      "invalid_result",
    ]);
  });

  it("rejects partial results as success and normalizes them as failures", () => {
    const partial = {
      outcome: "success",
      phase: "complete",
      ...safeContext,
      complete: false,
    };

    expect(auditOutcomeSchema.safeParse(partial).success).toBe(false);
    expect(serializeAuditOutcome(partial)).toBe(
      JSON.stringify({
        phase: "normalization",
        errorClass: "invalid_result",
        durationMs: 0,
      }),
    );
    expect(
      normalizeAuditOutcome({
        kind: "success",
        complete: false,
        phase: "complete",
        ...safeContext,
      }),
    ).toEqual({
      outcome: "failure",
      errorClass: "partial_result",
      phase: "complete",
      ...safeContext,
    });
  });

  it("normalizes malformed results into the finite invalid-result failure", () => {
    expect(normalizeAuditOutcome({ outcome: "success", phase: "complete" })).toEqual({
      outcome: "failure",
      errorClass: "invalid_result",
      phase: "normalization",
      durationMs: 0,
    });
  });

  it("retains only allowlisted observability fields while rejecting nested sensitive input", () => {
    const canary = "NESTED-CANARY-DO-NOT-LEAK";
    const normalized = normalizeAuditOutcome({
      kind: "execution",
      phase: "execution",
      ...safeContext,
      target: "https://alice:credential@example.test/private?token=secret#fragment",
      nested: {
        connectionString: "postgres://alice:secret@example.test:5432/audit",
        email: "alice@example.test",
        html: "<main>private report</main>",
        body: "private response body",
        stack: "Error: private stack",
        environment: { API_KEY: canary },
        canary,
      },
      error: new Error(canary),
    });
    const projection = projectAuditOutcomeForLog(normalized);
    const serialized = serializeAuditOutcome(normalized);

    expect(projection).toEqual({
      correlationId: "audit-contract-123",
      phase: "execution",
      errorClass: "execution",
      durationMs: 125,
    });
    expect(JSON.parse(serialized)).toEqual(projection);
    expect(serialized).not.toContain("example.test");
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain(canary);
    expect(() => projectAuditOutcomeForLog({ nested: { canary } })).not.toThrow();
    expect(serializeAuditOutcome({ nested: { canary } })).not.toContain(canary);
  });

  it("rejects unsafe correlation and duration values instead of serializing them", () => {
    const outcome = normalizeAuditOutcome({
      kind: "timeout",
      correlationId: "alice@example.test",
      durationMs: Infinity,
      phase: "https://example.test/unsafe",
    });

    expect(outcome).toEqual({
      outcome: "failure",
      errorClass: "timeout",
      phase: "request",
      durationMs: 0,
    });
  });

  it("performs no outbound request while normalizing or serializing", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network access is forbidden")));
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const outcome = normalizeAuditOutcome(syntheticFailures[0]);
      serializeAuditOutcome(outcome);
      projectAuditOutcomeForLog(outcome);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("rejects incomplete success payloads from parsing and serializes only a finite failure", () => {
    const partialSuccess = {
      outcome: "success",
      phase: "complete",
      correlationId: "audit-contract-456",
      durationMs: 25,
      response: { complete: false },
    };

    expect(auditOutcomeSchema.safeParse(partialSuccess).success).toBe(false);
    expect(projectAuditOutcomeForLog(partialSuccess)).toEqual({
      phase: "normalization",
      errorClass: "invalid_result",
      durationMs: 0,
    });
  });
});

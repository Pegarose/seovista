import { describe, expect, it } from "vitest";
import {
  redactValue,
  redactObject,
  redactForLogging,
  rejectCanary,
  CanaryValueError,
} from "../observability/redact.js";

describe("redactValue", () => {
  it("passes through primitives", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBe(null);
  });

  it("redacts strings that look like secret values", () => {
    expect(redactValue("sk-abcdefghijklmnopqrstuvwxyz")).toBe("[REDACTED]");
  });

  it("passes through ordinary strings", () => {
    expect(redactValue("seovista.com")).toBe("seovista.com");
  });

  it("redacts arrays recursively", () => {
    expect(redactValue(["sk-abc", "safe"])).toEqual(["[REDACTED]", "safe"]);
  });
});

describe("redactObject", () => {
  it("keeps allowlisted fields", () => {
    const result = redactObject({
      correlationId: "abc-123",
      phase: "start",
      durationMs: 100,
    });
    expect(result).toEqual({
      correlationId: "abc-123",
      phase: "start",
      durationMs: 100,
    });
  });

  it("redacts secret-like keys", () => {
    const result = redactObject({
      correlationId: "abc",
      apiKey: "sk-abc",
      password: "hunter2",
    });
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.correlationId).toBe("abc");
  });

  it("redacts nested objects", () => {
    const result = redactObject({
      correlationId: "abc",
      nested: {
        secretToken: "token-123",
        safe: "ok",
      },
    });
    expect((result.nested as Record<string, unknown>).secretToken).toBe("[REDACTED]");
    expect((result.nested as Record<string, unknown>).safe).toBe("ok");
  });

  it("redacts HTML/body content keys", () => {
    const result = redactObject({
      html: "<html>leak</html>",
      body: "sensitive body",
    });
    expect(result.html).toBe("[REDACTED]");
    expect(result.body).toBe("[REDACTED]");
  });

  it("redacts stack and trace keys", () => {
    const result = redactObject({
      stack: "Error: at ...",
      trace: "...",
    });
    expect(result.stack).toBe("[REDACTED]");
    expect(result.trace).toBe("[REDACTED]");
  });
});

describe("redactForLogging", () => {
  it("redacts an entire object for logging", () => {
    const result = redactForLogging({
      correlationId: "abc",
      secret: "shh",
    });
    expect(result).toEqual({
      correlationId: "abc",
      secret: "[REDACTED]",
    });
  });
});

describe("rejectCanary", () => {
  it("throws when a canary string appears in a string value", () => {
    expect(() => rejectCanary("prefix canary123 suffix", "canary123")).toThrow(CanaryValueError);
  });

  it("throws when a canary appears in a nested object", () => {
    expect(() =>
      rejectCanary({ a: { b: ["safe", "canary123"] } }, "canary123"),
    ).toThrow(CanaryValueError);
  });

  it("does not throw when the canary is absent", () => {
    expect(() => rejectCanary({ a: "safe" }, "canary123")).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { generateReportSignature, verifyReportSignature } from "../security/report-signer.js";

describe("Report Signer", () => {
  const secret = "test-secret-key-12345";
  const payload = { jobId: "job-123", score: 85, timestamp: 1700000000 };

  it("generates a deterministic HMAC SHA-256 signature", () => {
    const sig1 = generateReportSignature(payload, secret);
    const sig2 = generateReportSignature(payload, secret);

    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64); // hex sha256 length
  });

  it("verifies a valid signature successfully", () => {
    const signature = generateReportSignature(payload, secret);
    const isValid = verifyReportSignature(payload, signature, secret);

    expect(isValid).toBe(true);
  });

  it("rejects an invalid or tampered signature", () => {
    const signature = generateReportSignature(payload, secret);
    const tamperedPayload = { ...payload, score: 99 };
    const isValid = verifyReportSignature(tamperedPayload, signature, secret);

    expect(isValid).toBe(false);
  });

  it("rejects verification with wrong secret", () => {
    const signature = generateReportSignature(payload, secret);
    const isValid = verifyReportSignature(payload, signature, "wrong-secret");

    expect(isValid).toBe(false);
  });
});

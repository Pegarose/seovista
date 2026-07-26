import { createHmac, timingSafeEqual } from "node:crypto";

function canonicalizePayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return String(payload);
  }
  const keys = Object.keys(payload as Record<string, unknown>).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const key of keys) {
    sortedObj[key] = (payload as Record<string, unknown>)[key];
  }
  return JSON.stringify(sortedObj);
}

export function generateReportSignature(payload: unknown, secret: string): string {
  const data = canonicalizePayload(payload);
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyReportSignature(payload: unknown, signature: string, secret: string): boolean {
  if (!signature || typeof signature !== "string" || !secret) {
    return false;
  }
  try {
    const expected = generateReportSignature(payload, secret);
    const expectedBuffer = Buffer.from(expected, "hex");
    const signatureBuffer = Buffer.from(signature, "hex");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

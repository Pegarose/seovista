import { createHmac } from "crypto";

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

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
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
    const expectedBytes = hexToUint8Array(expected);
    const signatureBytes = hexToUint8Array(signature);

    return timingSafeEqual(expectedBytes, signatureBytes);
  } catch {
    return false;
  }
}

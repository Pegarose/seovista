import { describe, it, expect } from "vitest";
import { extractClientIp } from "../ip";

describe("extractClientIp", () => {
  it("trusts the last x-forwarded-for entry (appended by the trusted proxy), not a spoofed first entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(extractClientIp(headers)).toBe("5.6.7.8");
  });

  it("skips empty x-forwarded-for segments when picking the last entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, " });
    expect(extractClientIp(headers)).toBe("5.6.7.8");
  });

  it("returns a single x-forwarded-for entry unchanged", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.195" });
    expect(extractClientIp(headers)).toBe("203.0.113.195");
  });

  it("extracts IP from x-real-ip header if x-forwarded-for is missing", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.1" });
    expect(extractClientIp(headers)).toBe("198.51.100.1");
  });

  it("falls back to x-real-ip when x-forwarded-for has only empty segments", () => {
    const headers = new Headers({ "x-forwarded-for": " , ", "x-real-ip": "198.51.100.1" });
    expect(extractClientIp(headers)).toBe("198.51.100.1");
  });

  it("falls back to 127.0.0.1 when headers are missing", () => {
    const headers = new Headers({});
    expect(extractClientIp(headers)).toBe("127.0.0.1");
  });
});

import { describe, it, expect } from "vitest";
import { extractClientIp } from "../ip";

describe("extractClientIp", () => {
  it("extracts IP from x-forwarded-for header (first IP)", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.195, 70.41.3.18" });
    expect(extractClientIp(headers)).toBe("203.0.113.195");
  });

  it("extracts IP from x-real-ip header if x-forwarded-for is missing", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.1" });
    expect(extractClientIp(headers)).toBe("198.51.100.1");
  });

  it("falls back to 127.0.0.1 when headers are missing", () => {
    const headers = new Headers({});
    expect(extractClientIp(headers)).toBe("127.0.0.1");
  });
});

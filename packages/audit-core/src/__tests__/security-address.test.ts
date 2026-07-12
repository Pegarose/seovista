import { describe, expect, it } from "vitest";
import {
  validateIpAddress,
  isSafeIpAddress,
  validateHostname,
  validateResolverResult,
} from "../security/address.js";

describe("validateIpAddress", () => {
  it("rejects loopback IPv4", () => {
    expect(validateIpAddress("127.0.0.1").safe).toBe(false);
    expect(validateIpAddress("127.255.255.255").safe).toBe(false);
  });

  it("rejects loopback IPv6", () => {
    expect(validateIpAddress("::1").safe).toBe(false);
  });

  it("rejects unspecified addresses", () => {
    expect(validateIpAddress("0.0.0.0").safe).toBe(false);
    expect(validateIpAddress("::").safe).toBe(false);
  });

  it("rejects RFC1918 private IPv4", () => {
    expect(validateIpAddress("10.0.0.1").safe).toBe(false);
    expect(validateIpAddress("172.16.0.1").safe).toBe(false);
    expect(validateIpAddress("192.168.1.1").safe).toBe(false);
  });

  it("rejects carrier-grade NAT range", () => {
    expect(validateIpAddress("100.64.0.1").safe).toBe(false);
  });

  it("rejects link-local addresses", () => {
    expect(validateIpAddress("169.254.1.1").safe).toBe(false);
    expect(validateIpAddress("fe80::1").safe).toBe(false);
  });

  it("rejects multicast addresses", () => {
    expect(validateIpAddress("224.0.0.1").safe).toBe(false);
    expect(validateIpAddress("ff02::1").safe).toBe(false);
  });

  it("rejects IPv4-mapped IPv6", () => {
    expect(validateIpAddress("::ffff:192.168.1.1").safe).toBe(false);
  });

  it("rejects documentation ranges", () => {
    expect(validateIpAddress("192.0.2.1").safe).toBe(false);
    expect(validateIpAddress("198.51.100.1").safe).toBe(false);
    expect(validateIpAddress("203.0.113.1").safe).toBe(false);
    expect(validateIpAddress("2001:db8::1").safe).toBe(false);
  });

  it("rejects benchmark range", () => {
    expect(validateIpAddress("198.19.0.1").safe).toBe(false);
  });

  it("rejects broadcast", () => {
    expect(validateIpAddress("255.255.255.255").safe).toBe(false);
  });

  it("accepts public IPv4 addresses", () => {
    expect(validateIpAddress("8.8.8.8").safe).toBe(true);
    expect(validateIpAddress("1.1.1.1").safe).toBe(true);
  });

  it("accepts public IPv6 addresses", () => {
    expect(validateIpAddress("2001:4860:4860::8888").safe).toBe(true);
  });
});

describe("validateHostname", () => {
  it("rejects localhost", () => {
    expect(validateHostname("localhost").safe).toBe(false);
    expect(validateHostname("LOCALHOST").safe).toBe(false);
  });

  it("rejects cloud metadata endpoint", () => {
    expect(validateHostname("169.254.169.254").safe).toBe(false);
  });

  it("accepts ordinary public hostnames", () => {
    expect(validateHostname("seovista.com").safe).toBe(true);
  });
});

describe("validateResolverResult", () => {
  it("accepts all-public resolved addresses", () => {
    expect(validateResolverResult(["8.8.8.8", "2001:4860:4860::8888"]).safe).toBe(true);
  });

  it("rejects mixed allowed/denied addresses", () => {
    const result = validateResolverResult(["8.8.8.8", "127.0.0.1"]);
    expect(result.safe).toBe(false);
  });

  it("rejects empty resolver results", () => {
    expect(validateResolverResult([]).safe).toBe(false);
  });
});

describe("isSafeIpAddress", () => {
  it("returns false for private IP", () => {
    expect(isSafeIpAddress("192.168.1.1")).toBe(false);
  });

  it("returns true for public IP", () => {
    expect(isSafeIpAddress("8.8.8.8")).toBe(true);
  });
});

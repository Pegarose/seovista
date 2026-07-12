import { describe, expect, it } from "vitest";
import {
  validateUrl,
  isSafeUrl,
  normalizeUrl,
  DEFAULT_DENIED_PORTS,
} from "../security/url.js";

describe("normalizeUrl", () => {
  it("returns a canonical URL string", () => {
    expect(normalizeUrl("https://seovista.com/")).toBe("https://seovista.com/");
  });

  it("lowercases the host", () => {
    expect(normalizeUrl("https://SeoVista.com/")).toBe("https://seovista.com/");
  });

  it("removes the default https port", () => {
    expect(normalizeUrl("https://seovista.com:443/")).toBe("https://seovista.com/");
  });

  it("returns null for malformed input", () => {
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("validateUrl", () => {
  it("accepts a plain public HTTPS URL", async () => {
    const result = await validateUrl("https://seovista.com/");
    expect(result.safe).toBe(true);
    expect(result.normalizedUrl).toBe("https://seovista.com/");
  });

  it("rejects malformed URLs", async () => {
    const result = await validateUrl("https://[bad");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Malformed");
  });

  it("rejects non-HTTP schemes", async () => {
    const result = await validateUrl("ftp://seovista.com/");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Unsupported URL scheme");
  });

  it("rejects URLs with credentials", async () => {
    const result = await validateUrl("https://user:pass@seovista.com/");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("credentials");
  });

  it("rejects localhost", async () => {
    const result = await validateUrl("http://localhost:3000/");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("localhost");
  });

  it("rejects private IPv4 literals", async () => {
    const result = await validateUrl("http://192.168.1.1/");
    expect(result.safe).toBe(false);
  });

  it("rejects private IPv6 literals", async () => {
    const result = await validateUrl("http://[fe80::1]/");
    expect(result.safe).toBe(false);
  });

  it("rejects disallowed ports", async () => {
    const result = await validateUrl("http://seovista.com:6379/");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("6379");
  });

  it("rejects out-of-range ports", async () => {
    const result = await validateUrl("http://seovista.com:70000/");
    expect(result.safe).toBe(false);
  });

  it("applies a custom resolver result", async () => {
    const resolver = async () => ["127.0.0.1"];
    const result = await validateUrl("https://seovista.com/", { resolver });
    expect(result.safe).toBe(false);
  });

  it("accepts a hostname when resolver returns public addresses", async () => {
    const resolver = async () => ["8.8.8.8"];
    const result = await validateUrl("https://seovista.com/", { resolver });
    expect(result.safe).toBe(true);
  });

  it("rejects a hostname when resolver returns a mix of public and private", async () => {
    const resolver = async () => ["8.8.8.8", "127.0.0.1"];
    const result = await validateUrl("https://seovista.com/", { resolver });
    expect(result.safe).toBe(false);
  });

  it("rejects cloud metadata host", async () => {
    const result = await validateUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.safe).toBe(false);
  });
});

describe("isSafeUrl", () => {
  it("returns true for a public URL", async () => {
    expect(await isSafeUrl("https://seovista.com/")).toBe(true);
  });

  it("returns false for a private URL", async () => {
    expect(await isSafeUrl("http://127.0.0.1/")).toBe(false);
  });
});

describe("DEFAULT_DENIED_PORTS", () => {
  it("includes common internal service ports", () => {
    expect(DEFAULT_DENIED_PORTS).toContain(22);
    expect(DEFAULT_DENIED_PORTS).toContain(25);
    expect(DEFAULT_DENIED_PORTS).toContain(6379);
    expect(DEFAULT_DENIED_PORTS).toContain(5432);
  });
});

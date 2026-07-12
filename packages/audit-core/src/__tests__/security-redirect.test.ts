import { describe, expect, it } from "vitest";
import {
  validateRedirectChain,
  isSafeRedirectChain,
  DEFAULT_MAX_REDIRECTS,
} from "../security/redirect.js";

describe("validateRedirectChain", () => {
  it("accepts a safe relative redirect", async () => {
    const result = await validateRedirectChain(
      "https://seovista.com/",
      ["/about/"],
      {},
      10,
    );
    expect(result.safe).toBe(true);
    expect(result.finalUrl).toBe("https://seovista.com/about/");
  });

  it("rejects a redirect to a private host", async () => {
    const result = await validateRedirectChain(
      "https://seovista.com/",
      ["http://127.0.0.1/secret"],
      {},
      10,
    );
    expect(result.safe).toBe(false);
    expect(result.hops[0]?.reason).toContain("127.0.0.0/8");
  });

  it("rejects a redirect to a disallowed port", async () => {
    const result = await validateRedirectChain(
      "https://seovista.com/",
      ["https://seovista.com:6379/"],
      {},
      10,
    );
    expect(result.safe).toBe(false);
    expect(result.hops[0]?.reason).toContain("6379");
  });

  it("reapplies resolver policy on every hop", async () => {
    const resolver = async (hostname: string) =>
      hostname === "evil.local" ? ["127.0.0.1"] : ["8.8.8.8"];

    const result = await validateRedirectChain(
      "https://seovista.com/",
      ["https://evil.local/"],
      { resolver },
      10,
    );
    expect(result.safe).toBe(false);
  });

  it("enforces a finite hop limit", async () => {
    const locations = Array.from({ length: DEFAULT_MAX_REDIRECTS + 1 }, (_, i) =>
      i % 2 === 0 ? "/a/" : "/b/",
    );
    const result = await validateRedirectChain(
      "https://seovista.com/",
      locations,
      {},
      DEFAULT_MAX_REDIRECTS,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("exceeds");
  });

  it("reports each hop in the result", async () => {
    const result = await validateRedirectChain(
      "https://seovista.com/",
      ["/a/", "/b/"],
      {},
      10,
    );
    expect(result.hops).toHaveLength(2);
  });
});

describe("isSafeRedirectChain", () => {
  it("returns true for a safe chain", async () => {
    expect(
      await isSafeRedirectChain("https://seovista.com/", ["/about/"]),
    ).toBe(true);
  });

  it("returns false for an unsafe chain", async () => {
    expect(
      await isSafeRedirectChain("https://seovista.com/", ["http://127.0.0.1/"]),
    ).toBe(false);
  });
});

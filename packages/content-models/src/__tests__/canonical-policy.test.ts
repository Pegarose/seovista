import { describe, expect, it } from "vitest";
import { resolveCanonical } from "../index.js";

const siteUrl = "https://seovista.com";

function expectMapFailure(
  result: ReturnType<typeof resolveCanonical>,
  field: string,
  reason: string,
): void {
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.value).toMatchObject({
      success: false,
      field,
      reason,
      redacted: true,
    });
  }
}

describe("content-model canonical policy translation", () => {
  it("translates an insecure trusted site URL into a redacted map failure", () => {
    expectMapFailure(
      resolveCanonical("http://seovista.com", "/about/", undefined),
      "trustedSiteUrl",
      "Site URL must use HTTPS.",
    );
  });

  it.each([
    ["https://user:password@seovista.com", "trustedSiteUrl"],
    ["https://seovista.com:8443", "trustedSiteUrl"],
    ["https://seovista.com/about/", "trustedSiteUrl"],
    ["https://seovista.com/?source=test", "trustedSiteUrl"],
    ["https://seovista.com/#section", "trustedSiteUrl"],
  ])("rejects unsafe trusted site URLs: %s", (value, field) => {
    const result = resolveCanonical(value, "/about/", undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.value).toMatchObject({ field, redacted: true });
  });

  it.each(["/about", "/About/", "/about//", "/about/?source=test", "/about/#section"])(
    "rejects unsafe canonical paths: %s",
    (path) => {
      const result = resolveCanonical(siteUrl, path, undefined);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.value).toMatchObject({ field: "canonicalPath", redacted: true });
    },
  );

  it("preserves a valid canonical URL byte-for-byte", () => {
    const result = resolveCanonical(siteUrl, "/about/", undefined);
    expect(result).toEqual({
      success: true,
      value: {
        path: "/about/",
        absolute: "https://seovista.com/about/",
      },
    });
  });

  it.each([
    "https://example.com/about/",
    "https://user:password@seovista.com/about/",
    "https://seovista.com:8443/about/",
    "https://seovista.com/About/",
    "https://seovista.com/about/?source=test",
    "https://seovista.com/about/#section",
  ])("rejects unsafe canonical overrides: %s", (overrideUrl) => {
    const result = resolveCanonical(siteUrl, "/about/", overrideUrl);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.value).toMatchObject({ field: "canonicalOverride", redacted: true });
  });
});

import { describe, expect, it } from "vitest";
import {
  SchemaValidationError,
  buildAbsoluteUrl,
  validatePath,
  validateSiteUrl,
} from "../index";

const siteUrl = "https://seovista.com";

function expectSchemaValidation(action: () => unknown, field: string, reason: string): void {
  try {
    action();
    throw new Error("Expected schema validation to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(error).toMatchObject({ field, reason });
  }
}

describe("schema canonical validation", () => {
  it.each([
    ["http://seovista.com", "Site URL must use HTTPS."],
    ["https://user:password@seovista.com", "Site URL must be an HTTPS origin with no userinfo, port, path, query, or fragment."],
    ["https://seovista.com:8443", "Site URL must be an HTTPS origin with no userinfo, port, path, query, or fragment."],
    ["https://seovista.com/about/", "Site URL must be an HTTPS origin with no userinfo, port, path, query, or fragment."],
  ])("translates trusted-site rejection for %s", (value, reason) => {
    expectSchemaValidation(() => validateSiteUrl(value), "siteUrl", reason);
  });

  it.each([
    ["/about", "Canonical path must end with a trailing slash."],
    ["/About/", "Canonical path must be lowercase."],
    ["/about//", "Canonical path contains invalid characters."],
    ["/about/?source=test", "Canonical path must end with a trailing slash."],
    ["/about/#section", "Canonical path must end with a trailing slash."],
  ])("translates canonical-path rejection for %s", (path, reason) => {
    expectSchemaValidation(() => validatePath(path), "path", reason);
  });

  it("builds byte-stable valid canonical URLs", () => {
    expect(buildAbsoluteUrl(siteUrl, "/about/")).toBe("https://seovista.com/about/");
  });
});

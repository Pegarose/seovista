import { describe, expect, it } from "vitest";
import {
  CanonicalError,
  MetadataValidationError,
  buildMetadata,
  normalizePath,
  parseSiteUrl,
  parseTrustedUrl,
  resolveCanonical,
  resolveCanonicalFromOverride,
} from "../index";

const siteUrl = "https://seovista.com";

describe("seo-core canonical policy", () => {
  it.each([
    "http://seovista.com",
    "https://user:password@seovista.com",
    "https://seovista.com:8443",
    "https://seovista.com/about/",
    "https://seovista.com/?source=test",
    "https://seovista.com/#section",
  ])("rejects an untrusted site URL: %s", (value) => {
    expect(() => parseSiteUrl(value)).toThrow(CanonicalError);
  });

  it.each([
    "/about",
    "about/",
    "/About/",
    "/about/?source=test",
    "/about/#section",
    "/about me/",
    "/about//",
  ])("rejects a non-canonical path: %s", (path) => {
    expect(() => normalizePath(path)).toThrow(CanonicalError);
  });

  it("accepts only a lowercase trailing-slash canonical path", () => {
    expect(normalizePath("/digital-authority/")).toBe("/digital-authority/");
    expect(resolveCanonical(siteUrl, "/digital-authority/")).toBe(
      "https://seovista.com/digital-authority/",
    );
  });

  it.each([
    "http://seovista.com/about/",
    "https://user:password@seovista.com/about/",
    "https://seovista.com:8443/about/",
    "https://seovista.com/about/?source=test",
    "https://seovista.com/about/#section",
  ])("rejects an unsafe absolute URL: %s", (value) => {
    expect(() => parseTrustedUrl(value)).toThrow(CanonicalError);
  });

  it("accepts a trusted canonical override", () => {
    expect(resolveCanonicalFromOverride(siteUrl, "https://seovista.com/about/")).toBe(
      "https://seovista.com/about/",
    );
  });

  it.each([
    "https://example.com/about/",
    "https://seovista.com/About/",
    "https://seovista.com/about",
    "https://seovista.com/about/?source=test",
    "https://seovista.com/about/#section",
  ])("rejects an untrusted canonical override: %s", (overrideUrl) => {
    expect(() => resolveCanonicalFromOverride(siteUrl, overrideUrl)).toThrow(CanonicalError);
  });
});

describe("seo-core metadata validation", () => {
  it("uses a named error for an empty title", () => {
    expectMetadataValidationError(
      () =>
        buildMetadata(siteUrl, {
          title: "",
          description: "Valid description.",
          canonicalPath: "/",
        }),
      "title",
    );
  });

  it("uses a named error for an empty description", () => {
    expectMetadataValidationError(
      () =>
        buildMetadata(siteUrl, {
          title: "Valid title",
          description: " ",
          canonicalPath: "/",
        }),
      "description",
    );
  });
});

function expectMetadataValidationError(action: () => unknown, field: string): void {
  try {
    action();
    throw new Error("Expected metadata validation to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(MetadataValidationError);
    expect(error).toMatchObject({ field });
  }
}

// Static boundary test: raw NextG payload modules and types must not be
// importable from the public package surface.

import { describe, it, expect } from "vitest";

// @ts-expect-error Raw NextG payload modules and types are not exported from the public surface
import { RawPage as _RawPage, rawPageSchema as _rawPageSchema, RawEntity as _RawEntity, rawBaseContentSchema as _rawBaseContentSchema } from "../index";

describe("content-models public boundary", () => {
  it("does not expose raw types at runtime", async () => {
    const mod = await import("../index.js");
    const keys = Object.keys(mod);
    const rawKeys = keys.filter((k) => k.startsWith("raw") || k.startsWith("Raw"));
    expect(rawKeys).toEqual([]);
  });

  it("type-only imports above are expected to fail", () => {
    // This test exists so the file is not empty; the real assertion is the
    // ts-expect-error directive above, which fails the build if raw types leak.
    expect(true).toBe(true);
  });
});

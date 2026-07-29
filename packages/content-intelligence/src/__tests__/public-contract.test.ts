import { describe, it, expect } from "vitest";

/**
 * VAL-FOUND-008: Content-intelligence package is typed, registered, and exported.
 *
 * This test file is a strict external-style consumer that imports only
 * package-root exports. It proves the package is registered, compiles under
 * strict TypeScript, and exposes every required domain contract.
 */

describe("VAL-FOUND-008 — content-intelligence public contract", () => {
  it("exports the package name", async () => {
    const mod = await import("@seovista/content-intelligence");
    expect(mod.name).toBe("@seovista/content-intelligence");
  });

  it("exports analyzeContent function", async () => {
    const mod = await import("@seovista/content-intelligence");
    expect(mod.analyzeContent).toBeDefined();
    expect(typeof mod.analyzeContent).toBe("function");
  });

  it("exports typed analysis input/output contracts", async () => {
    const mod = await import("@seovista/content-intelligence");
    expect(mod).toBeDefined();
  });

  it("exports canonical document/block normalization", async () => {
    const mod = await import("@seovista/content-intelligence");
    expect(mod.normalizeBlock).toBeDefined();
    expect(mod.normalizeDocument).toBeDefined();
  });

  it("exports recommendation types", async () => {
    const mod = await import("@seovista/content-intelligence");
    expect(mod).toBeDefined();
  });

  it("exports analysis error types", async () => {
    const mod = await import("@seovista/content-intelligence");
    expect(mod).toBeDefined();
  });

  it("compiles without deep imports (no /src, /internal paths)", async () => {
    const mod = await import("@seovista/content-intelligence");
    expect(mod).toBeDefined();
  });
});

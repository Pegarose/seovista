import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js server bundle boundaries", () => {
  it("keeps the worker package external to the server bundle", () => {
    const config = nextConfig("phase-production-build");

    expect(config.serverExternalPackages).toContain("@seovista/worker");
  });
});

import { describe, it, expect } from "vitest";
import { getScoringConfiguration, defaultScoringConfiguration } from "../index.js";

describe("geo-engine contracts", () => {
  it("exposes a versioned scoring configuration", () => {
    const config = getScoringConfiguration();
    expect(config.version).toBe("0.1.0");
    expect(config.weights.access).toBe(0.25);
    expect(config.weights.understanding).toBe(0.25);
    expect(config.weights.evidence).toBe(0.25);
    expect(config.weights.authorityReadiness).toBe(0.25);
    expect(config.maxScore).toBe(1);
    expect(config.passFailRules.length).toBeGreaterThan(0);
  });

  it("declares limitations without implying live AI visibility", () => {
    const config = getScoringConfiguration();
    const descriptions = config.limitations.map((l) => l.description);
    expect(descriptions.some((d) => d.includes("Sprint 0"))).toBe(true);
    expect(descriptions.some((d) => d.includes("no live") || d.includes("no real"))).toBe(true);
  });

  it("default configuration is immutable reference", () => {
    expect(defaultScoringConfiguration).toBe(getScoringConfiguration());
  });
});

import { describe, it, expect } from "vitest";
import { parseGeoReadinessResult, GeoReadinessValidationError, getScoringConfiguration } from "../index.js";
import type { GeoReadinessResult } from "../index.js";

const validResult: GeoReadinessResult = {
  methodologyVersion: "0.1.0",
  auditedAt: "2026-07-01T00:00:00.000Z",
  target: "https://seovista.com/",
  scores: {
    access: 0.5,
    understanding: 0.5,
    evidence: 0.5,
    authorityReadiness: 0.5,
    overall: 0.5,
  },
  checks: [],
  priorities: [],
  limitations: [
    {
      id: "limitation-no-live-model",
      description: "Sprint 0 uses no live model queries.",
      scope: "methodology",
    },
  ],
};

describe("geo-engine parser", () => {
  it("parses a valid GeoReadinessResult", () => {
    const parsed = parseGeoReadinessResult(validResult);
    expect(parsed.methodologyVersion).toBe("0.1.0");
    expect(parsed.limitations).toHaveLength(1);
  });

  it("rejects missing methodologyVersion", () => {
    const bad = { ...validResult, methodologyVersion: undefined };
    expect(() => parseGeoReadinessResult(bad)).toThrow(GeoReadinessValidationError);
  });

  it("rejects missing limitations", () => {
    const bad = { ...validResult, limitations: [] };
    expect(() => parseGeoReadinessResult(bad)).toThrow(GeoReadinessValidationError);
  });

  it("rejects results that market AI Visibility", () => {
    const bad = {
      ...validResult,
      limitations: [
        {
          id: "bad",
          description: "We guarantee AI Visibility improvements.",
          scope: "methodology",
        },
      ],
    };
    expect(() => parseGeoReadinessResult(bad)).toThrow(GeoReadinessValidationError);
  });

  it("rejects results that claim a live audit", () => {
    const bad = {
      ...validResult,
      limitations: [
        {
          id: "bad",
          description: "This is a live audit result.",
          scope: "data",
        },
      ],
    };
    expect(() => parseGeoReadinessResult(bad)).toThrow(GeoReadinessValidationError);
  });
});

describe("geo-engine scoring configuration snapshot", () => {
  it("matches the versioned scoring configuration", () => {
    const config = getScoringConfiguration();
    expect(config).toMatchSnapshot();
  });
});

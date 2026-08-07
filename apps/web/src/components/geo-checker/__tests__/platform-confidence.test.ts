import { describe, expect, it } from "vitest";
import { getConfidenceBand } from "../platform-confidence-band";

describe("getConfidenceBand", () => {
  it("returns the low / experimental band when experimental=true regardless of confidence", () => {
    // Sprint 0 estimates are all experimental, so even a high numeric
    // confidence must surface as "Low — experimental" to avoid over-claiming.
    const band = getConfidenceBand(0.95, true);
    expect(band.level).toBe("low");
    expect(band.label).toBe("Low — experimental");
    expect(band.icon).toBe("⚠️");
  });

  it("returns the low band when confidence < 0.5 and not experimental", () => {
    const band = getConfidenceBand(0.3, false);
    expect(band.level).toBe("low");
    expect(band.label).toBe("Low — experimental");
  });

  it("returns the medium band for 0.5 <= confidence < 0.75 and not experimental", () => {
    const band = getConfidenceBand(0.6, false);
    expect(band.level).toBe("medium");
    expect(band.label).toBe("Medium — estimated");
    expect(band.icon).toBe("◐");
  });

  it("treats confidence 0.5 exactly as medium", () => {
    expect(getConfidenceBand(0.5, false).level).toBe("medium");
  });

  it("returns the high band for confidence >= 0.75 and not experimental", () => {
    const band = getConfidenceBand(0.8, false);
    expect(band.level).toBe("high");
    expect(band.label).toBe("High — reliable");
    expect(band.icon).toBe("✓");
  });

  it("treats confidence 0.75 exactly as high", () => {
    expect(getConfidenceBand(0.75, false).level).toBe("high");
  });

  it("always returns a non-empty icon so the signal is never colour-only (WCAG)", () => {
    for (const [confidence, experimental] of [
      [0.1, false],
      [0.5, false],
      [0.95, false],
      [0.95, true],
    ] as const) {
      const band = getConfidenceBand(confidence, experimental);
      expect(band.icon.length).toBeGreaterThan(0);
      expect(band.label.length).toBeGreaterThan(0);
    }
  });
});

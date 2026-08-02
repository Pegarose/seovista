import { describe, expect, it } from "vitest";
import { CODE_TO_TAGS } from "@seovista/geo-engine";
import { ISSUE_TRANSLATIONS, MODULE_STATUS_LABEL } from "../issue-translations";

describe("ISSUE_TRANSLATIONS parity with geo-engine", () => {
  it("every CODE_TO_TAGS key has a non-empty Turkish translation", () => {
    const engineCodes = Object.keys(CODE_TO_TAGS);
    const dictCodes = Object.keys(ISSUE_TRANSLATIONS);
    const missing = engineCodes.filter((code) => !dictCodes.includes(code));
    expect(missing, `Missing translations for: ${missing.join(", ")}`).toEqual([]);
  });

  it("every translation value is a non-empty trimmed string", () => {
    for (const [code, value] of Object.entries(ISSUE_TRANSLATIONS)) {
      expect(typeof value, `${code} value type`).toBe("string");
      expect(value.trim().length, `${code} value must be non-empty`).toBeGreaterThan(0);
    }
  });
});

describe("MODULE_STATUS_LABEL", () => {
  it("covers all status bands with non-empty Turkish labels", () => {
    const bands = ["excellent", "good", "needs_improvement", "poor", "critical"] as const;
    for (const band of bands) {
      expect(MODULE_STATUS_LABEL[band].trim().length).toBeGreaterThan(0);
    }
  });
});

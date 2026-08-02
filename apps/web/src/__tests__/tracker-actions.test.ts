import { describe, it, expect } from "vitest";
import { validateTrackerSessionTargetInput } from "../lib/tracker/validation";

describe("TrackerSessionTargetSchema", () => {
  it("accepts valid keyword and domain", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "seo denetimi", domain: "example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyword).toBe("seo denetimi");
      expect(result.data.domain).toBe("example.com");
    }
  });

  it("rejects empty keyword", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "", domain: "example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty domain", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "seo", domain: "" });
    expect(result.success).toBe(false);
  });

  it("rejects keyword over 200 chars", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "x".repeat(201), domain: "example.com" });
    expect(result.success).toBe(false);
  });
});

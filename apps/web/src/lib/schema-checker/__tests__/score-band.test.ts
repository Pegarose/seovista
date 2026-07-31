import { describe, expect, it } from "vitest";
import { getSchemaScoreBand } from "../score-band";

describe("getSchemaScoreBand", () => {
  it("maps scores to the result-page band thresholds", () => {
    expect(getSchemaScoreBand(100)).toBe("excellent");
    expect(getSchemaScoreBand(90)).toBe("excellent");
    expect(getSchemaScoreBand(89)).toBe("good");
    expect(getSchemaScoreBand(80)).toBe("good");
    expect(getSchemaScoreBand(79)).toBe("needs_improvement");
    expect(getSchemaScoreBand(60)).toBe("needs_improvement");
    expect(getSchemaScoreBand(59)).toBe("poor");
    expect(getSchemaScoreBand(40)).toBe("poor");
    expect(getSchemaScoreBand(39)).toBe("critical");
    expect(getSchemaScoreBand(0)).toBe("critical");
  });
});

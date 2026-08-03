import { describe, it, expect } from "vitest";
import { evaluateTransition } from "../alerts/alert-evaluator.js";

const MIN = 3;

describe("evaluateTransition", () => {
  it("returns null for the first observation (no baseline)", () => {
    expect(evaluateTransition(null, 1, MIN)).toBeNull();
    expect(evaluateTransition(null, 0, MIN)).toBeNull();
  });

  it("detects dropped_out_of_top10", () => {
    expect(evaluateTransition(4, 0, MIN)).toBe("dropped_out_of_top10");
    expect(evaluateTransition(10, 0, MIN)).toBe("dropped_out_of_top10");
  });

  it("detects entered_top10", () => {
    expect(evaluateTransition(0, 4, MIN)).toBe("entered_top10");
    expect(evaluateTransition(0, 1, MIN)).toBe("entered_top10");
  });

  it("detects significant_drop at exactly the boundary delta", () => {
    expect(evaluateTransition(1, 4, MIN)).toBe("significant_drop");
    expect(evaluateTransition(2, 5, MIN)).toBe("significant_drop");
  });

  it("detects significant_rise at exactly the boundary delta", () => {
    expect(evaluateTransition(4, 1, MIN)).toBe("significant_rise");
    expect(evaluateTransition(7, 4, MIN)).toBe("significant_rise");
  });

  it("returns null for small movement and equality", () => {
    expect(evaluateTransition(1, 3, MIN)).toBeNull(); // delta 2 < 3
    expect(evaluateTransition(3, 1, MIN)).toBeNull(); // delta 2 < 3
    expect(evaluateTransition(5, 5, MIN)).toBeNull();
    expect(evaluateTransition(0, 0, MIN)).toBeNull();
  });

  it("respects a custom minDelta", () => {
    expect(evaluateTransition(1, 6, 5)).toBe("significant_drop");
    expect(evaluateTransition(1, 4, 5)).toBeNull();
  });

  it("does not treat 0-crossing as significant_drop/rise", () => {
    expect(evaluateTransition(3, 0, MIN)).toBe("dropped_out_of_top10");
    expect(evaluateTransition(0, 3, MIN)).toBe("entered_top10");
  });
});

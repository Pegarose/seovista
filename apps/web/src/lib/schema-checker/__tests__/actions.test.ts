import { describe, expect, it } from "vitest";
import { validateSchemaInput } from "../actions";

describe("validateSchemaInput", () => {
  it("validates url format", () => {
    const valid = validateSchemaInput("https://example.com");
    expect(valid.success).toBe(true);

    const invalid = validateSchemaInput("invalid-url");
    expect(invalid.success).toBe(false);
  });
});

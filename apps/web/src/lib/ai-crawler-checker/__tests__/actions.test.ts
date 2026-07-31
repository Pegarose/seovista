import { describe, expect, it } from "vitest";
import { validateAiCrawlerInput } from "../validation";

describe("validateAiCrawlerInput", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateAiCrawlerInput("https://example.com").success).toBe(true);
  });
  it("rejects invalid URLs", () => {
    expect(validateAiCrawlerInput("not-a-url").success).toBe(false);
  });
  it("rejects metadata and loopback targets", () => {
    expect(validateAiCrawlerInput("http://169.254.169.254/").success).toBe(false);
    expect(validateAiCrawlerInput("http://127.0.0.2/").success).toBe(false);
    expect(validateAiCrawlerInput("http://[::1]/").success).toBe(false);
  });
  it("rejects non-http protocols", () => {
    expect(validateAiCrawlerInput("file:///etc/passwd").success).toBe(false);
  });
});

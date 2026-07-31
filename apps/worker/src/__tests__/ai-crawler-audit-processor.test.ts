import { describe, expect, it } from "vitest";
import { processAiCrawlerAuditPayload } from "../processors/ai-crawler-audit";

describe("processAiCrawlerAuditPayload", () => {
  it("evaluates crawlers and penalizes blocked AI search bots only", () => {
    const txt = "User-agent: *\nDisallow:\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://example.com/sitemap.xml\n";
    const result = processAiCrawlerAuditPayload(txt, "https://example.com/robots.txt");
    expect(result.robotsTxtFound).toBe(true);
    const search = result.crawlers.find((c) => c.userAgent === "OAI-SearchBot");
    const training = result.crawlers.find((c) => c.userAgent === "GPTBot");
    expect(search?.status).toBe("blocked");
    expect(training?.status).toBe("blocked");
    expect(result.score).toBe(88); // 100 - 12 (ai-search block); ai-training block carries no penalty
  });

  it("caps score at 60 when robots.txt is missing and recommends creating one", () => {
    const result = processAiCrawlerAuditPayload(null, "https://example.com/robots.txt");
    expect(result.robotsTxtFound).toBe(false);
    expect(result.score).toBe(60);
    expect(result.crawlers.every((c) => c.status === "allowed")).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

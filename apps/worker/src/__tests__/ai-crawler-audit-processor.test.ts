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

  it("uses classic-search wording for blocked search bots and AI wording for ai-search bots", () => {
    const txt = "User-agent: *\nDisallow:\n\nUser-agent: Googlebot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\nSitemap: https://example.com/sitemap.xml\n";
    const result = processAiCrawlerAuditPayload(txt, "https://example.com/robots.txt");
    const googlebot = result.crawlers.find((c) => c.userAgent === "Googlebot");
    const oaiSearch = result.crawlers.find((c) => c.userAgent === "OAI-SearchBot");
    expect(googlebot?.status).toBe("blocked");
    expect(oaiSearch?.status).toBe("blocked");
    // 100 - 12 (search block) - 12 (ai-search block)
    expect(result.score).toBe(76);
    const googlebotRec = result.recommendations.find((r) => r.startsWith("Googlebot"));
    const oaiRec = result.recommendations.find((r) => r.startsWith("OAI-SearchBot"));
    expect(googlebotRec).toBeDefined();
    expect(oaiRec).toBeDefined();
    expect(googlebotRec).toContain("geleneksel arama sonuçlarında görünürlüğünüz azalır");
    expect(googlebotRec).not.toContain("AI cevap motorlarında");
    expect(oaiRec).toContain("AI cevap motorlarında görünürlüğünüz azalır");
    expect(oaiRec).not.toContain("geleneksel arama sonuçlarında");
  });

  it("caps score at 60 when robots.txt is missing and recommends creating one", () => {
    const result = processAiCrawlerAuditPayload(null, "https://example.com/robots.txt");
    expect(result.robotsTxtFound).toBe(false);
    expect(result.score).toBe(60);
    expect(result.crawlers.every((c) => c.status === "allowed")).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  detectRuleConflicts,
  evaluateCrawlerAccess,
  isPathAllowed,
  parseRobotsTxt,
} from "../robots";

const SAMPLE = `
# comment line
User-agent: *
Disallow: /admin
Allow: /admin/public
Sitemap: https://example.com/sitemap.xml

User-agent: GPTBot
Disallow: /
`;

describe("parseRobotsTxt", () => {
  it("parses groups, rules and sitemaps, skipping comments", () => {
    const doc = parseRobotsTxt(SAMPLE);
    expect(doc.groups).toHaveLength(2);
    expect(doc.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(doc.parseErrors).toHaveLength(0);
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
  });

  it("treats empty Disallow as allow (skips the rule)", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow:\n");
    expect(doc.groups[0]?.rules).toHaveLength(0);
  });
});

describe("isPathAllowed", () => {
  const doc = parseRobotsTxt(SAMPLE);
  it("honours longest-match and allow-tie semantics", () => {
    expect(isPathAllowed(doc, "Googlebot", "/admin")).toBe(false);
    expect(isPathAllowed(doc, "Googlebot", "/admin/public")).toBe(true);
    expect(isPathAllowed(doc, "Googlebot", "/page")).toBe(true);
  });
  it("applies the most specific user-agent group", () => {
    expect(isPathAllowed(doc, "GPTBot", "/anything")).toBe(false);
    expect(isPathAllowed(doc, "gptbot", "/anything")).toBe(false); // case-insensitive
  });
  it("supports wildcard * and end anchor $ in patterns", () => {
    const d = parseRobotsTxt("User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*\n");
    expect(isPathAllowed(d, "bingbot", "/files/a.pdf")).toBe(false);
    expect(isPathAllowed(d, "bingbot", "/files/a.pdfx")).toBe(true);
    expect(isPathAllowed(d, "bingbot", "/tmp/x/y")).toBe(false);
  });
});

describe("evaluateCrawlerAccess", () => {
  it("returns blocked / partial / allowed", () => {
    const doc = parseRobotsTxt(SAMPLE);
    expect(evaluateCrawlerAccess(doc, "GPTBot")).toBe("blocked");
    expect(evaluateCrawlerAccess(doc, "Googlebot")).toBe("partial");
    const open = parseRobotsTxt("User-agent: *\nDisallow:\n");
    expect(evaluateCrawlerAccess(open, "Googlebot")).toBe("allowed");
  });
});

describe("detectRuleConflicts", () => {
  it("detects same-pattern allow+disallow in one group", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
    expect(detectRuleConflicts(doc).length).toBe(1);
  });
  it("detects UA-specific full block while wildcard allows", () => {
    const doc = parseRobotsTxt(SAMPLE);
    const conflicts = detectRuleConflicts(doc);
    expect(conflicts.some((c) => c.description.includes("GPTBot".toLowerCase()) || c.description.includes("gptbot"))).toBe(true);
  });
});

describe("parseRobotsTxt edge cases", () => {
  it("strips a leading UTF-8 BOM", () => {
    const doc = parseRobotsTxt("\uFEFFUser-agent: *\nDisallow: /private\n");
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("splits CRLF (\\r\\n) line endings", () => {
    const doc = parseRobotsTxt("User-agent: *\r\nDisallow: /a\r\n");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
  });

  it("splits lone CR (\\r) line endings", () => {
    const doc = parseRobotsTxt("User-agent: *\rDisallow: /a\r");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
  });

  it("strips inline # comments on rule lines", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow: /admin # keep out\n");
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/admin");
  });

  it("records a parseError for a line without a colon", () => {
    const doc = parseRobotsTxt("User-agent: *\nthis-has-no-colon\n");
    expect(doc.parseErrors.length).toBe(1);
    expect(doc.parseErrors[0]).toMatch(/geçersiz alan/);
  });

  it("records a parseError for a rule before any user-agent", () => {
    const doc = parseRobotsTxt("Disallow: /secret\nUser-agent: *\n");
    expect(doc.parseErrors.length).toBe(1);
    expect(doc.parseErrors[0]).toMatch(/user-agent olmadan/);
  });

  it("treats empty Allow as a no-op (rule not pushed)", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow:\nDisallow: /x\n");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.type).toBe("disallow");
  });

  it("accumulates multiple User-agent lines into one group", () => {
    const doc = parseRobotsTxt("User-agent: Googlebot\nUser-agent: GPTBot\nDisallow: /both\n");
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0]?.userAgents).toEqual(["googlebot", "gptbot"]);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("is case-insensitive on field names (USER-AGENT)", () => {
    const doc = parseRobotsTxt("USER-AGENT: *\nDISALLOW: /x\n");
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/x");
  });

  it("ignores unknown fields (Crawl-delay, Host) without error", () => {
    const doc = parseRobotsTxt("User-agent: *\nCrawl-delay: 10\nHost: example.com\nDisallow: /x\n");
    expect(doc.parseErrors).toHaveLength(0);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("skips an empty Sitemap value", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nSitemap:\n");
    expect(doc.sitemaps).toHaveLength(0);
  });
});

describe("isPathAllowed tie-break", () => {
  it("allow wins when Allow and Disallow patterns have equal length", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
    expect(isPathAllowed(doc, "Googlebot", "/x")).toBe(true);
  });
});

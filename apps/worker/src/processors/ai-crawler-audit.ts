import {
  detectContradictoryRuleConflicts,
  detectRuleConflicts,
  evaluateAllCrawlers,
  parseRobotsTxt,
  type CrawlerCategory,
  type CrawlerAccessStatus,
  type RuleConflict,
} from "@seovista/seo-core";

export interface AiCrawlerAuditResultPayload {
  readonly score: number;
  readonly robotsTxtFound: boolean;
  readonly robotsTxtUrl: string;
  readonly sitemaps: readonly string[];
  readonly crawlers: ReadonlyArray<{
    userAgent: string;
    label: string;
    category: CrawlerCategory;
    status: CrawlerAccessStatus;
  }>;
  readonly conflicts: readonly RuleConflict[];
  readonly recommendations: readonly string[];
  readonly parseErrors: readonly string[];
}

const BLOCK_PENALTY_SEARCH = 12;
const CONFLICT_PENALTY = 8;
const CONFLICT_PENALTY_CAP = 24;
const MISSING_ROBOTS_CAP = 60;
const MISSING_SITEMAP_PENALTY = 5;

export function processAiCrawlerAuditPayload(
  robotsTxtContent: string | null,
  robotsTxtUrl: string,
): AiCrawlerAuditResultPayload {
  const found = robotsTxtContent !== null;
  const doc = parseRobotsTxt(robotsTxtContent ?? "");
  const crawlers = evaluateAllCrawlers(doc);
  const conflicts = found ? detectRuleConflicts(doc) : [];
  const contradictoryConflicts = found ? detectContradictoryRuleConflicts(doc) : [];
  const recommendations: string[] = [];

  let penalty = 0;
  for (const crawler of crawlers) {
    if (crawler.status === "blocked" && crawler.category !== "ai-training") {
      penalty += BLOCK_PENALTY_SEARCH;
      if (crawler.category === "search") {
        recommendations.push(
          `${crawler.label} tamamen engellenmiş — geleneksel arama sonuçlarında görünürlüğünüz azalır. Engellemek istemiyorsanız ilgili Disallow kuralını kaldırın.`,
        );
      } else {
        recommendations.push(
          `${crawler.label} tamamen engellenmiş — AI cevap motorlarında görünürlüğünüz azalır. Engellemek istemiyorsanız ilgili Disallow kuralını kaldırın.`,
        );
      }
    }
  }
  penalty += Math.min(contradictoryConflicts.length * CONFLICT_PENALTY, CONFLICT_PENALTY_CAP);

  let score = Math.max(0, 100 - penalty);

  if (!found) {
    score = Math.min(score, MISSING_ROBOTS_CAP);
    recommendations.push(
      "robots.txt dosyanız bulunamadı. Varsayılan olarak tüm botlara açık sayılırsınız; net bir politika için robots.txt oluşturup Sitemap direktifi ekleyin.",
    );
  } else if (doc.sitemaps.length === 0) {
    score = Math.max(0, score - MISSING_SITEMAP_PENALTY);
    recommendations.push(
      "robots.txt içinde Sitemap direktifi bulunamadı. Sitemap: <tam-url> satırı eklemek arama ve AI botlarının sitenizi daha verimli keşfetmesini sağlar.",
    );
  }
  for (const conflict of contradictoryConflicts) {
    recommendations.push(`Kural çakışması: ${conflict.description}`);
  }

  return {
    score,
    robotsTxtFound: found,
    robotsTxtUrl,
    sitemaps: doc.sitemaps,
    crawlers,
    conflicts,
    recommendations,
    parseErrors: doc.parseErrors,
  };
}

import type { CrawlerAccessStatus, RobotsTxtDocument } from "./robots.js";
import { evaluateCrawlerAccess } from "./robots.js";

export type CrawlerCategory = "ai-training" | "ai-search" | "search";

export interface CrawlerDescriptor {
  readonly userAgent: string;
  readonly label: string;
  readonly category: CrawlerCategory;
}

export interface CrawlerEvaluation extends CrawlerDescriptor {
  readonly status: CrawlerAccessStatus;
}

export const AI_CRAWLER_REGISTRY: readonly CrawlerDescriptor[] = [
  { userAgent: "GPTBot", label: "GPTBot (OpenAI eğitim)", category: "ai-training" },
  { userAgent: "ClaudeBot", label: "ClaudeBot (Anthropic eğitim)", category: "ai-training" },
  { userAgent: "Google-Extended", label: "Google-Extended (Gemini eğitim)", category: "ai-training" },
  { userAgent: "Applebot-Extended", label: "Applebot-Extended (Apple AI eğitim)", category: "ai-training" },
  { userAgent: "CCBot", label: "CCBot (Common Crawl)", category: "ai-training" },
  { userAgent: "Bytespider", label: "Bytespider (ByteDance)", category: "ai-training" },
  { userAgent: "Amazonbot", label: "Amazonbot", category: "ai-training" },
  { userAgent: "meta-externalagent", label: "Meta-ExternalAgent (Meta AI)", category: "ai-training" },
  { userAgent: "OAI-SearchBot", label: "OAI-SearchBot (ChatGPT arama)", category: "ai-search" },
  { userAgent: "ChatGPT-User", label: "ChatGPT-User (kullanıcı istekleri)", category: "ai-search" },
  { userAgent: "Claude-User", label: "Claude-User (kullanıcı istekleri)", category: "ai-search" },
  { userAgent: "PerplexityBot", label: "PerplexityBot", category: "ai-search" },
  { userAgent: "Perplexity-User", label: "Perplexity-User (kullanıcı istekleri)", category: "ai-search" },
  { userAgent: "Googlebot", label: "Googlebot", category: "search" },
  { userAgent: "Bingbot", label: "Bingbot", category: "search" },
  { userAgent: "Applebot", label: "Applebot", category: "search" },
  { userAgent: "DuckDuckBot", label: "DuckDuckBot", category: "search" },
] as const;

export function evaluateAllCrawlers(doc: RobotsTxtDocument): CrawlerEvaluation[] {
  return AI_CRAWLER_REGISTRY.map((c) => ({ ...c, status: evaluateCrawlerAccess(doc, c.userAgent) }));
}

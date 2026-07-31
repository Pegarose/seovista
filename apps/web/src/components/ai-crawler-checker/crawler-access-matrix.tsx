import React from "react";

export type CrawlerCategory = "ai-training" | "ai-search" | "search";
export type CrawlerAccessStatus = "allowed" | "blocked" | "partial";

export interface CrawlerAccessEntry {
  readonly userAgent: string;
  readonly label: string;
  readonly category: CrawlerCategory;
  readonly status: CrawlerAccessStatus;
}

export interface CrawlerAccessMatrixProps {
  readonly crawlers: readonly CrawlerAccessEntry[];
}

const CATEGORY_SECTIONS: ReadonlyArray<{
  key: CrawlerCategory;
  heading: string;
  description: string;
}> = [
  {
    key: "ai-search",
    heading: "AI Arama & Cevap Botları",
    description:
      "ChatGPT, Perplexity ve benzeri AI cevap motorlarının sitenizi canlı arama sonuçlarında kullanmasını sağlayan botlar.",
  },
  {
    key: "ai-training",
    heading: "AI Eğitim Botları",
    description:
      "Model eğitimi için içerik toplayan botlar. Bu botlara izin vermek veya onları engellemek site sahibinin kararıdır.",
  },
  {
    key: "search",
    heading: "Geleneksel Arama Botları",
    description:
      "Google, Bing ve diğer klasik arama motorlarının dizinleme botları.",
  },
];

const STATUS_PRESENTATION: Record<
  CrawlerAccessStatus,
  { text: string; icon: string; badgeClass: string }
> = {
  allowed: {
    text: "İzinli",
    icon: "✓",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
  },
  partial: {
    text: "Kısmi",
    icon: "◐",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  blocked: {
    text: "Engelli",
    icon: "✕",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
  },
};

/**
 * Per-bot robots.txt access matrix. Status is always conveyed with an icon
 * plus a visible text badge (never color alone) and every badge carries an
 * aria-label naming both the bot and its status.
 */
export function CrawlerAccessMatrix({ crawlers }: CrawlerAccessMatrixProps) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Bot Erişim Matrisi</h2>
        <p className="text-sm text-slate-500 mt-1">
          robots.txt kurallarınıza göre her botun site geneli erişim durumu.
        </p>
      </div>

      {CATEGORY_SECTIONS.map((section) => {
        const entries = crawlers.filter((c) => c.category === section.key);
        if (entries.length === 0) return null;
        const headingId = `crawler-category-${section.key}`;
        return (
          <section key={section.key} aria-labelledby={headingId}>
            <h3 id={headingId} className="text-base font-semibold text-slate-900">
              {section.heading}
            </h3>
            <p className="text-xs text-slate-500 mt-1">{section.description}</p>
            <ul role="list" className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
              {entries.map((crawler) => {
                const status = STATUS_PRESENTATION[crawler.status];
                const isNeutralPolicyChoice =
                  crawler.category === "ai-training" && crawler.status === "blocked";
                return (
                  <li
                    key={crawler.userAgent}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <span className="block text-sm font-medium text-slate-900">
                        {crawler.label}
                      </span>
                      <span className="block text-xs font-mono text-slate-500 mt-0.5">
                        {crawler.userAgent}
                      </span>
                      {isNeutralPolicyChoice && (
                        <p className="mt-1 text-xs text-slate-500">
                          Engelleme bir politika tercihidir — hata değildir
                        </p>
                      )}
                    </div>
                    <span
                      role="status"
                      aria-label={`${crawler.label}: ${status.text}`}
                      className={`inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-1 text-xs font-semibold rounded-full border ${status.badgeClass}`}
                    >
                      <span aria-hidden="true">{status.icon}</span>
                      {status.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

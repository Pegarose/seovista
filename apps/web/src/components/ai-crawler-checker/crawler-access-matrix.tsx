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
    heading: "AI search & answer bots",
    description:
      "Bots that let ChatGPT, Perplexity and similar AI answer engines cite your site in live search results.",
  },
  {
    key: "ai-training",
    heading: "AI training bots",
    description:
      "Bots that collect content for model training. Allowing or blocking them is the site owner's policy choice.",
  },
  {
    key: "search",
    heading: "Traditional search bots",
    description:
      "Indexing bots for Google, Bing and other classic search engines.",
  },
];

const STATUS_PRESENTATION: Record<
  CrawlerAccessStatus,
  { text: string; icon: string; badgeClass: string }
> = {
  allowed: {
    text: "Allowed",
    icon: "✓",
    badgeClass: "text-signal border-signal/40",
  },
  partial: {
    text: "Partial",
    icon: "◐",
    badgeClass: "text-ember border-ember/40",
  },
  blocked: {
    text: "Blocked",
    icon: "✕",
    badgeClass: "text-ember border-ember/40 bg-mineral/60",
  },
};

/**
 * Per-bot robots.txt access matrix. Status is always conveyed with an icon
 * plus a visible text badge (never color alone) and every badge carries an
 * aria-label naming both the bot and its status.
 */
export function CrawlerAccessMatrix({ crawlers }: CrawlerAccessMatrixProps) {
  return (
    <div className="bg-card p-6 rounded-lg border border-hairline space-y-8">
      <div>
        <h2 className="font-serif text-2xl text-ink">Bot access matrix</h2>
        <p className="text-sm text-muted-ink mt-1">
          Site-wide access status for each bot according to your robots.txt rules.
        </p>
      </div>

      {CATEGORY_SECTIONS.map((section) => {
        const entries = crawlers.filter((c) => c.category === section.key);
        if (entries.length === 0) return null;
        const headingId = `crawler-category-${section.key}`;
        return (
          <section key={section.key} aria-labelledby={headingId}>
            <h3 id={headingId} className="font-serif text-lg text-ink">
              {section.heading}
            </h3>
            <p className="text-xs text-muted-ink mt-1">{section.description}</p>
            <ul role="list" className="mt-3 divide-y divide-hairline border-y border-hairline">
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
                      <span className="block text-sm font-medium text-ink">
                        {crawler.label}
                      </span>
                      <span className="block text-xs font-mono text-muted-ink mt-0.5">
                        {crawler.userAgent}
                      </span>
                      {isNeutralPolicyChoice && (
                        <p className="mt-1 text-xs text-muted-ink">
                          Blocking is a policy choice — not an error
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

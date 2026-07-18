import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { DisciplineHero } from "@/components/discipline-hero";
import {
  EmptyState,
  LedgerSkeleton,
  RetryError,
  UnavailableState,
} from "@/components/editorial";
import { fetchCollection } from "@/lib/content/client";
import { toArticleVM } from "@/lib/content/view-models";
import type { CollectionResult } from "@/lib/content/types";
import { canonicalFor } from "@/lib/site-config";
import type { ArticleVM } from "@/lib/content/view-models";

const TITLE = "Insights — SeoVista";
const DESC =
  "Editorial research from SeoVista on generative retrieval, attribution, and digital authority. We publish only when the underlying work is ready.";

async function loadInsights(): Promise<CollectionResult<ArticleVM>> {
  const raw = await fetchCollection("articles");
  if (raw.status !== "ok") return raw;
  const items = raw.items.map(toArticleVM).filter((a): a is ArticleVM => a !== null);
  return { status: "ok", items, generatedAt: raw.generatedAt };
}

const insightsQuery = queryOptions({
  queryKey: ["insights"],
  queryFn: loadInsights,
});

export const Route = createFileRoute("/insights")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(insightsQuery);
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/insights/") },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/insights/") }],
  }),
  pendingMs: 200,
  pendingMinMs: 300,
  pendingComponent: InsightsPendingSkeleton,
  errorComponent: InsightsErrorBoundary,
  notFoundComponent: InsightsNotFound,
  component: InsightsPage,
});

function LedgerFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 pb-16 md:px-16 md:pb-24">
      <div className="grid grid-cols-1 gap-16 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-3">
          <span className="sticky top-24 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
            Editorial Ledger
          </span>
        </div>
        <div className="md:col-span-9">{children}</div>
      </div>
    </section>
  );
}

function InsightsHero() {
  return (
    <DisciplineHero
      number="05"
      displayName="Insights"
      lede="Editorial research on generative retrieval, traditional search, and digital authority. Written slowly, published rarely, corrected in public."
      capabilities={[
        "Field notes from our own work",
        "Standards over volume",
        "Corrections on the record",
      ]}
      supportingNote="We would rather hold a page empty than fill it with borrowed opinions. Foundation stage — the ledger is deliberately short."
      inquireTo="/contact"
      inquireLabel="Suggest a topic"
    />
  );
}

function InsightsPendingSkeleton() {
  return (
    <article className="bg-paper text-ink">
      <InsightsHero />
      <LedgerFrame>
        <LedgerSkeleton rows={4} />
      </LedgerFrame>
    </article>
  );
}

function InsightsErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <article className="bg-paper text-ink">
      <InsightsHero />
      <LedgerFrame>
        <RetryError
          title="The editorial ledger could not be loaded."
          description={
            error?.message ??
            "A network or backend error prevented us from reading the ledger. Try again in a moment."
          }
          onRetry={() => {
            reset();
            router.invalidate();
          }}
          retryLabel="Reload ledger"
        />
      </LedgerFrame>
    </article>
  );
}

function InsightsNotFound() {
  return (
    <article className="bg-paper text-ink">
      <InsightsHero />
      <LedgerFrame>
        <EmptyState
          title="Nothing to show at this address."
          description="The insight you were looking for is not on the ledger. Return to the index to see what has been published."
        />
      </LedgerFrame>
    </article>
  );
}


const STANDARDS = [
  {
    id: "01",
    title: "We publish when a piece survives internal review.",
    detail:
      "No editorial calendar, no filler. If a draft cannot answer its own thesis, it does not ship.",
  },
  {
    id: "02",
    title: "Every claim is traceable.",
    detail:
      "Primary sources, dated observations, and named authors — or the claim is cut.",
  },
  {
    id: "03",
    title: "We do not repackage other people's work.",
    detail:
      "Summaries of trending posts are not research. We write from what we have measured or read directly.",
  },
  {
    id: "04",
    title: "We correct in public.",
    detail:
      "If a published piece turns out to be wrong, the correction lives on the same page, dated.",
  },
];

const STREAMS = [
  {
    id: "01",
    name: "Generative retrieval",
    detail:
      "How answer systems choose, quote, and paraphrase source pages — and what that selection is doing to the open web.",
  },
  {
    id: "02",
    name: "Attribution & provenance",
    detail:
      "Where citations survive summarisation, where they collapse, and what authors can do about it.",
  },
  {
    id: "03",
    name: "Authority signals",
    detail:
      "The slow work behind reputation: authorship, organisational identity, and the record a domain builds over time.",
  },
];

function InsightsPage() {
  const { data } = useSuspenseQuery(insightsQuery);
  const isUnavailable = data.status !== "ok";
  const items = data.status === "ok" ? data.items : [];
  const hasItems = items.length > 0;

  return (
    <article className="bg-paper text-ink">
      <InsightsHero />

      {/* Editorial ledger */}
      <LedgerFrame>
        {hasItems ? (
          <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
            {items.map((article, i) => (
              <li key={article.id} className="py-8">
                <article className="grid grid-cols-[3rem_1fr] items-baseline gap-x-6">
                  <span className="font-mono text-xs tabular-nums text-muted-ink">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-ink">
                      <time dateTime={article.publishedAt}>
                        {new Date(article.publishedAt)
                          .toISOString()
                          .slice(0, 10)}
                      </time>
                    </p>
                    <h2 className="mt-2 font-serif text-2xl leading-tight text-ink md:text-3xl">
                      {article.title}
                    </h2>
                    {article.summary && (
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-ink md:text-base">
                        {article.summary}
                      </p>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : isUnavailable ? (
          <UnavailableState
            title="The editorial ledger is temporarily unavailable."
            description="We could not reach the source right now. This page will populate again as soon as the backend responds."
          />
        ) : (
          <EmptyState
            title="The editorial ledger is empty in this release."
            description="Insights will be populated when genuine research is ready to publish. We would rather wait than fill the page with placeholders."
          />
        )}
      </LedgerFrame>


      {/* Editorial standards */}
      <section className="border-t border-hairline">
        <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-32">
          <div className="grid grid-cols-1 gap-16 md:grid-cols-12 md:gap-8">
            <div className="md:col-span-3">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-signal">
                Editorial standards
              </span>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-ink">
                The rules the ledger is held to, before anything is added to it.
              </p>
            </div>
            <div className="md:col-span-9">
              <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
                {STANDARDS.map((s) => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[3rem_1fr] items-baseline gap-x-6 py-6"
                  >
                    <span className="font-mono text-xs tabular-nums text-muted-ink">
                      {s.id}
                    </span>
                    <div>
                      <h3 className="font-serif text-xl text-ink">{s.title}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-ink">
                        {s.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Research streams */}
      <section className="border-t border-hairline">
        <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-32">
          <div className="grid grid-cols-1 gap-16 md:grid-cols-12 md:gap-8">
            <div className="md:col-span-3">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-spectral">
                Research streams
              </span>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-ink">
                Three questions we keep returning to. Most publications will
                sit under one of them.
              </p>
            </div>
            <div className="md:col-span-9 grid grid-cols-1 gap-6 md:grid-cols-3">
              {STREAMS.map((stream) => (
                <article
                  key={stream.id}
                  className="flex flex-col border-t border-hairline pt-6"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-ink">
                    Stream / {stream.id}
                  </span>
                  <h3 className="mt-3 font-serif text-2xl leading-tight text-ink">
                    {stream.name}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-ink">
                    {stream.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cadence */}
      <section className="border-t border-hairline">
        <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-16 md:py-32">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-4">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
                Cadence
              </span>
            </div>
            <div className="md:col-span-8">
              <p className="max-w-3xl font-serif text-3xl leading-tight text-ink md:text-5xl">
                We publish when a piece survives internal review.
                <span className="text-signal">.</span>
              </p>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-ink">
                No editorial calendar. No SEO-driven volume targets. If a
                quarter passes with nothing new on the ledger, that is the
                quarter reporting itself honestly.
              </p>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

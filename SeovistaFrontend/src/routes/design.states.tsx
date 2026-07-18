import { createFileRoute } from "@tanstack/react-router";
import {
  EmptyState,
  InstrumentIndexSkeleton,
  LedgerSkeleton,
  LoadingState,
  RetryError,
  UnavailableState,
} from "@/components/editorial";

/**
 * Deterministic showcase of every editorial state used across /tools and
 * /insights. This route is the fixture for visual regression tests — each
 * frame carries a stable `data-testid` so Playwright can screenshot it in
 * isolation. Not linked from navigation; intentionally excluded from the
 * sitemap. Safe to publish because it renders no user or backend data.
 */
export const Route = createFileRoute("/design/states")({
  head: () => ({
    meta: [
      { title: "Editorial states — SeoVista" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: StatesFixture,
});

function Frame({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-10">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-ink">
        {label}
      </p>
      <div
        data-testid={id}
        className="rounded-lg border border-hairline bg-paper p-6"
      >
        {children}
      </div>
    </section>
  );
}

function StatesFixture() {
  return (
    <main className="bg-paper text-ink">
      <Frame id="state-ledger-skeleton" label="Ledger skeleton">
        <LedgerSkeleton rows={3} />
      </Frame>

      <Frame id="state-instrument-skeleton" label="Instrument index skeleton">
        <InstrumentIndexSkeleton rows={3} />
      </Frame>

      <Frame id="state-loading" label="Loading state">
        <LoadingState
          title="Loading ledger"
          description="Fetching the latest published entries."
          lines={4}
        />
      </Frame>

      <Frame id="state-empty" label="Empty state">
        <EmptyState
          title="No entries published yet"
          description="The editorial ledger is empty. New entries appear here once published."
        />
      </Frame>

      <Frame id="state-unavailable" label="Unavailable state">
        <UnavailableState
          title="Ledger unavailable"
          description="The backend is unreachable. Try again shortly."
        />
      </Frame>

      <Frame id="state-error" label="Retry error">
        <RetryError
          title="Could not load ledger"
          description="A network error interrupted the request."
          onRetry={() => {}}
          retryLabel="Try again"
        />
      </Frame>
    </main>
  );
}
